import * as vscode from 'vscode';

import { ContainerCli, ImageSummary } from './cli/containerCli';
import { AppleContainerError, ErrorCode } from './core/errors';
import { events } from './core/events';
import { log, logError, logWarn } from './core/logger';
import { handleWorkspaceAutoStart } from './core/workspaceAutoStart';
import { ImageTreeItem, ImagesTreeProvider } from './views/imageTree';
import { ContainerTreeItem, ContainersTreeProvider } from './views/containerTree';
import { ContainerCreateWizard } from './views/containerCreateWizard';
import { SystemTreeProvider, SystemTreeItem } from './views/systemTree';
import { fetchLatestRelease } from './updater/githubClient';
import { logFormatter } from './core/logFormatter';
import { ContainerLogManager } from './core/containerLogs';
import { DevcontainerManager } from './devcontainer/devcontainerManager';

import { UpdateManager } from './updater/updateManager';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating Apple Container Manager extension');

  const cli = new ContainerCli();
  const systemProvider = new SystemTreeProvider();
  const logManager = new ContainerLogManager(cli);
  const containersProvider = new ContainersTreeProvider(cli, logManager);
  const imagesProvider = new ImagesTreeProvider(cli);
  const devcontainerManager = new DevcontainerManager(cli);
  const updateManager = new UpdateManager(cli);

  const reopenStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  reopenStatusBarItem.command = 'appleContainer.devcontainer.reopen';
  reopenStatusBarItem.text = '$(remote-explorer) Reopen in Container';
  reopenStatusBarItem.tooltip = 'Reopen folder in devcontainer';

  context.subscriptions.push(
    systemProvider,
    containersProvider,
    imagesProvider,
    logManager,
    logFormatter,
    devcontainerManager,
    updateManager,
    vscode.window.registerTreeDataProvider('appleContainerSystem', systemProvider),
    vscode.window.registerTreeDataProvider('appleContainerContainers', containersProvider),
    vscode.window.registerTreeDataProvider('appleContainerImages', imagesProvider),
    reopenStatusBarItem
  );

  const updateStatusBarVisibility = async (): Promise<void> => {
    const files = await vscode.workspace.findFiles('{**/.devcontainer/devcontainer.json,**/.appcontainer/devcontainer.json,.appcontainer.json}', '**/node_modules/**', 1);
    if (files.length > 0) {
      reopenStatusBarItem.show();
    } else {
      reopenStatusBarItem.hide();
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void updateStatusBarVisibility(); }),
    vscode.workspace.onDidCreateFiles(() => { void updateStatusBarVisibility(); }),
    vscode.workspace.onDidDeleteFiles(() => { void updateStatusBarVisibility(); })
  );

  void updateStatusBarVisibility();

  const cliReady = await initializeCli(cli, containersProvider, imagesProvider);
  if (cliReady) {
    await handleWorkspaceAutoStart(cli);
    await refreshSystemStatus(cli, containersProvider, imagesProvider, { refreshResources: true, requestedRunning: true });
  }

  registerCommands(context, cli, systemProvider, containersProvider, imagesProvider, logManager, devcontainerManager);
  registerErrorHandler(context);
}

export function deactivate(): void {
}

async function initializeCli(
  cli: ContainerCli,
  containersProvider: ContainersTreeProvider,
  imagesProvider: ImagesTreeProvider
): Promise<boolean> {
  try {
    await refreshSystemStatus(cli, containersProvider, imagesProvider, { refreshResources: true });
    return true;
  } catch (error) {
    const containerError = error instanceof AppleContainerError ? error : new AppleContainerError('Failed to detect container CLI', ErrorCode.Unknown, error);
    logError('Unable to read container CLI version', containerError);
    const message = containerError.code === ErrorCode.CliNotFound
      ? 'Apple container CLI not found. Install it to enable full functionality.'
      : `Failed to detect Apple container CLI. ${containerError.message}`;
    void vscode.window.showWarningMessage(message);
    return false;
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  cli: ContainerCli,
  systemProvider: SystemTreeProvider,
  containersProvider: ContainersTreeProvider,
  imagesProvider: ImagesTreeProvider,
  logManager: ContainerLogManager,
  devcontainerManager: DevcontainerManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('appleContainer.system.start', async () => {
      await withCommandHandling('Starting container system', async () => {
        await cli.system('start');
        await refreshSystemStatus(cli, containersProvider, imagesProvider, { requestedRunning: true, refreshResources: true });
        void vscode.window.showInformationMessage('Apple container system started.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.system.stop', async () => {
      await withCommandHandling('Stopping container system', async () => {
        await cli.system('stop');
        await refreshSystemStatus(cli, containersProvider, imagesProvider, { requestedRunning: false, refreshResources: true });
        void vscode.window.showInformationMessage('Apple container system stopped.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.system.refresh', async () => {
      await withCommandHandling('Refreshing system status', async () => {
        await refreshSystemStatus(cli, containersProvider, imagesProvider, { refreshResources: true });
        void vscode.window.showInformationMessage('Apple container system status refreshed.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.containers.refresh', async () => {
      await withCommandHandling('Refreshing containers list', async () => {
        await containersProvider.refresh();
      });
    }),
    vscode.commands.registerCommand('appleContainer.images.refresh', async () => {
      await withCommandHandling('Refreshing images list', async () => {
        await imagesProvider.refresh();
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.start', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      await withCommandHandling(`Starting container ${identifier}`, async () => {
        await cli.startContainer(item.container.id);
        await containersProvider.refresh();
        void vscode.window.showInformationMessage(`Container ${identifier} started.`);
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.stop', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      await withCommandHandling(`Stopping container ${identifier}`, async () => {
        try {
          await cli.stopContainer(item.container.id);
          await containersProvider.refresh();
          void vscode.window.showInformationMessage(`Container ${identifier} stopped.`);
        } catch (error) {
          const selection = await vscode.window.showWarningMessage(
            `Container ${identifier} failed to stop gracefully. Force kill?`,
            'Force Kill'
          );
          if (selection === 'Force Kill') {
            await cli.killContainer(item.container.id);
            await containersProvider.refresh();
            void vscode.window.showInformationMessage(`Container ${identifier} force killed.`);
          } else {
            throw error;
          }
        }
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.exec', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      const input = await vscode.window.showInputBox({
        title: `Run Command in ${identifier}`,
        placeHolder: 'e.g. npm install',
        prompt: 'Command will run via /bin/sh -c inside the container'
      });
      if (!input?.trim()) {
        return;
      }
      await withCommandHandling(`Exec in ${identifier}`, async () => {
        const { stdout, stderr } = await cli.execInContainer(item.container.id, ['/bin/sh', '-c', input], {
          user: undefined,
          workdir: undefined,
          tty: false,
          interactive: false
        });
        if (stdout?.trim()) {
          log(stdout.trim());
        }
        if (stderr?.trim()) {
          logWarn(stderr.trim());
        }
        void vscode.window.showInformationMessage(`Command finished in ${identifier}.`);
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.shell', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      await withCommandHandling(`Opening shell in ${identifier}`, async () => {
        const term = vscode.window.createTerminal({
          name: `Shell: ${identifier}`,
          shellPath: 'container',
          shellArgs: ['exec', '--interactive', '--tty', item.container.id, '/bin/sh']
        });
        term.show(true);
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.logs.start', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      await withCommandHandling(`Starting log stream for ${identifier}`, async () => {
        if (logManager.isStreaming(item.container.id)) {
          void vscode.window.showInformationMessage(`Already streaming logs for ${identifier}.`);
          return;
        }
        const started = await logManager.startStreaming(item.container.id, identifier);
        if (started) {
          void vscode.window.showInformationMessage(`Streaming logs for ${identifier}.`);
        } else {
          void vscode.window.showWarningMessage(`Failed to start log stream for ${identifier}.`);
        }
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.logs.stop', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      await withCommandHandling(`Stopping log stream for ${identifier}`, async () => {
        if (!logManager.isStreaming(item.container.id)) {
          void vscode.window.showInformationMessage(`No active log stream for ${identifier}.`);
          return;
        }
        const stopped = logManager.stopStreaming(item.container.id);
        if (stopped) {
          void vscode.window.showInformationMessage(`Stopping log stream for ${identifier}…`);
        } else {
          void vscode.window.showWarningMessage(`Unable to stop log stream for ${identifier}.`);
        }
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.logs.export', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }
      const identifier = item.container.name ?? item.container.id;
      const history = logManager.getHistory(item.container.id);
      if (history.length === 0) {
        void vscode.window.showInformationMessage(`No logs captured for ${identifier} yet. Start streaming logs first.`);
        return;
      }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${identifier.replace(/[^a-zA-Z0-9-_]/g, '_')}.log`),
        filters: { 'Log files': ['log', 'txt'] },
        saveLabel: 'Export Logs'
      });

      if (!uri) {
        return;
      }

      await withCommandHandling(`Exporting logs for ${identifier}`, async () => {
        await logManager.exportLogs(item.container.id, uri);
        void vscode.window.showInformationMessage(`Logs exported to ${uri.fsPath}`);
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.remove', async (item?: ContainerTreeItem) => {
      if (!item?.container || item.container.id === 'empty-containers') {
        return;
      }

      const identifier = item.container.name ?? item.container.id;
      if (isContainerRunningStatus(item.container.status)) {
        void vscode.window.showWarningMessage(`Container ${identifier} is running. Stop it before removal.`);
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to remove container ${identifier}?`,
        { modal: true },
        'Remove'
      );
      if (confirmation !== 'Remove') {
        return;
      }

      await withCommandHandling(`Removing container ${identifier}`, async () => {
        await cli.removeContainer(item.container.id);
        await containersProvider.refresh();
        void vscode.window.showInformationMessage(`Container ${identifier} removed.`);
      });
    }),
    vscode.commands.registerCommand('appleContainer.image.remove', async (item?: ImageTreeItem) => {
      if (!item?.image || item.image.id === 'empty-images') {
        return;
      }

      if (item.image.inUse) {
        const reference = [item.image.repository, item.image.tag].filter(Boolean).join(':') || item.image.id;
        void vscode.window.showWarningMessage(`Image ${reference} is currently in use and cannot be removed.`);
        return;
      }

      const references = buildImageRemovalReferences(item.image);

      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to remove image ${references[0] ?? item.image.id}?`,
        { modal: true },
        'Remove'
      );
      if (confirmation !== 'Remove') {
        return;
      }

      await withCommandHandling(`Removing image ${references[0] ?? item.image.id}`, async () => {
        await cli.removeImage(references);
        await imagesProvider.refresh();
        void vscode.window.showInformationMessage(`Image ${references[0] ?? item.image.id} removed.`);
      });
    }),
    vscode.commands.registerCommand('appleContainer.container.create', async () => {
      await withCommandHandling('Creating container', async () => {
        let images = imagesProvider.getCurrentImages();
        if (images.length === 0) {
          try {
            await imagesProvider.refresh();
            images = imagesProvider.getCurrentImages();
          } catch (error) {
            logError('Failed to refresh images prior to container creation', error);
          }
        }
        const wizard = new ContainerCreateWizard(images, vscode.workspace.workspaceFolders);
        const result = await wizard.run();
        if (!result) {
          return;
        }
        await cli.createContainer(result);
        await containersProvider.refresh();
        const identifier = result.name ?? result.image;
        void vscode.window.showInformationMessage(`Container ${identifier} created successfully.`);
      }, 'Creating container...');
    }),
    vscode.commands.registerCommand('appleContainer.refresh', async () => {
      await withCommandHandling('Refreshing Apple container resources', async () => {
        await refreshSystemStatus(cli, containersProvider, imagesProvider, { refreshResources: true });
      });
      void vscode.window.showInformationMessage('Apple container views refreshed.');
    }),
    vscode.commands.registerCommand('appleContainer.system.upgrade', async (item?: SystemTreeItem) => {
      const targetUrl = item?.latestUrl ?? systemProvider.getLatestReleaseUrl();
      if (!targetUrl) {
        void vscode.window.showInformationMessage('No GitHub release information available.');
        return;
      }
      void vscode.env.openExternal(vscode.Uri.parse(targetUrl));
    }),
    vscode.commands.registerCommand('appleContainer.update.check', async () => {
      await withCommandHandling('Checking for CLI updates', async () => {
        const [currentVersion, latestRelease] = await Promise.all([
          cli.version().catch(() => 'unknown'),
          fetchLatestRelease()
        ]);

        if (currentVersion === 'unknown') {
          void vscode.window.showInformationMessage(`Latest container CLI release: ${latestRelease.tagName}. Install manually from ${latestRelease.htmlUrl}.`);
          return;
        }

        if (latestRelease.tagName === currentVersion) {
          void vscode.window.showInformationMessage(`You are on the latest container CLI version (${currentVersion}).`);
        } else {
          const message = `New container CLI version available: ${latestRelease.tagName} (current ${currentVersion}).`;
          const open = 'View Release';
          void vscode.window
            .showInformationMessage(message, open)
            .then(selection => {
              if (selection === open) {
                void vscode.env.openExternal(vscode.Uri.parse(latestRelease.htmlUrl));
              }
            });
        }
      });
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.build', async () => {
      await withCommandHandling('Building devcontainer image', async () => {
        await devcontainerManager.buildDevcontainer();
      }, 'Building devcontainer image...');
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.apply', async () => {
      await withCommandHandling('Applying devcontainer configuration', async () => {
        await devcontainerManager.applyDevcontainer();
      }, 'Applying devcontainer configuration...');
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.rebuild', async () => {
      await withCommandHandling('Rebuilding devcontainer', async () => {
        await devcontainerManager.rebuildDevcontainer();
      }, 'Rebuilding devcontainer...');
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.runPostCommands', async () => {
      await withCommandHandling('Running devcontainer lifecycle commands', async () => {
        await devcontainerManager.runPostLifecycle();
      });
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.open', async () => {
      await withCommandHandling('Displaying devcontainer connection instructions', async () => {
        await devcontainerManager.showOpenInstructions();
      });
    }),
    vscode.commands.registerCommand('appleContainer.devcontainer.reopen', async () => {
      await withCommandHandling('Reopening folder in devcontainer', async () => {
        await devcontainerManager.reopenInContainer();
      });
    })
  );
}

function registerErrorHandler(context: vscode.ExtensionContext): void {
  const listener = (error: AppleContainerError): void => {
    logError('Global error event', error);
    void vscode.window.showErrorMessage(error.message);
  };
  events.on('error', listener);
  context.subscriptions.push({ dispose: () => events.off('error', listener) });
}

async function refreshAll(
  containersProvider: ContainersTreeProvider,
  imagesProvider: ImagesTreeProvider
): Promise<void> {
  await Promise.all([containersProvider.refresh(), imagesProvider.refresh()]);
}

interface RefreshOptions {
  requestedRunning?: boolean;
  refreshResources?: boolean;
}

async function refreshSystemStatus(
  cli: ContainerCli,
  containersProvider: ContainersTreeProvider,
  imagesProvider: ImagesTreeProvider,
  options: RefreshOptions = {}
): Promise<void> {
  const latestReleasePromise = fetchLatestRelease().catch(error => {
    const containerError = error instanceof AppleContainerError ? error : new AppleContainerError('Failed to fetch latest release', ErrorCode.NetworkError, error);
    logError('Unable to fetch latest Apple container CLI release', containerError);
    return undefined;
  });

  const [localVersion, detectedRunning, latestRelease] = await Promise.all([
    cli.version(),
    cli.getSystemStatus(),
    latestReleasePromise
  ]);

  const resolvedRunning = detectedRunning ?? false;
  const latestVersion = latestRelease?.tagName;
  const latestUrl = latestRelease?.htmlUrl;
  const updateAvailable = isUpdateAvailable(localVersion, latestVersion);

  if (options.requestedRunning !== undefined && options.requestedRunning !== resolvedRunning) {
    log(`System running state (${resolvedRunning}) does not match requested state (${options.requestedRunning}).`);
  }
  log(`Emitting system status (running=${resolvedRunning}, localVersion=${localVersion}, latestVersion=${latestVersion ?? 'unknown'}, updateAvailable=${updateAvailable})`);
  events.emit('system:status', {
    running: resolvedRunning,
    localVersion,
    latestVersion,
    latestUrl,
    updateAvailable
  });

  if (options.refreshResources) {
    if (resolvedRunning) {
      await refreshAll(containersProvider, imagesProvider);
    } else {
      log('Skipping container/image refresh because system is not running');
    }
  }
}

function normalizeVersion(version?: string): string | undefined {
  if (!version) {
    return undefined;
  }
  return version.trim().replace(/^v/i, '');
}

function parseVersion(version: string): { numbers: number[]; preRelease?: string } {
  const normalized = normalizeVersion(version) ?? '';
  const [core, preRelease] = normalized.split('-', 2);
  const parts = core.split('.').map(part => {
    const value = Number.parseInt(part, 10);
    return Number.isNaN(value) ? 0 : value;
  });
  return {
    numbers: parts,
    preRelease: preRelease
  };
}

function isUpdateAvailable(currentVersion?: string, latestVersion?: string): boolean {
  if (!latestVersion) {
    return false;
  }
  if (!currentVersion) {
    return true;
  }

  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  const length = Math.max(current.numbers.length, latest.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const currentValue = current.numbers[index] ?? 0;
    const latestValue = latest.numbers[index] ?? 0;
    if (latestValue > currentValue) {
      return true;
    }
    if (latestValue < currentValue) {
      return false;
    }
  }

  if (current.preRelease && !latest.preRelease) {
    return true;
  }
  if (!current.preRelease && latest.preRelease) {
    return false;
  }
  if (current.preRelease && latest.preRelease) {
    return latest.preRelease > current.preRelease;
  }

  return false;
}

async function withCommandHandling(message: string, action: () => Promise<void>, progressTitle?: string): Promise<void> {
  log(message);
  try {
    if (progressTitle) {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: false
      }, async () => {
        await action();
      });
    } else {
      await action();
    }
  } catch (error) {
    const containerError = error instanceof AppleContainerError ? error : new AppleContainerError('Command failed', ErrorCode.CommandFailed, error);
    events.emit('error', containerError);
  }
}

function isContainerRunningStatus(status?: string): boolean {
  if (!status) {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized.includes('running') || normalized.startsWith('up');
}

function buildImageRemovalReferences(image: ImageSummary): string[] {
  const references = new Set<string>();
  const repository = image.repository?.trim();
  const tag = image.tag?.trim();
  const digest = image.digest?.trim();
  const id = image.id?.trim();

  if (repository && tag) {
    references.add(`${repository}:${tag}`);
  }
  if (repository) {
    references.add(repository);
  }
  if (digest) {
    references.add(digest);
  }
  if (id) {
    references.add(id);
  }

  return Array.from(references);
}
