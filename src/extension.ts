import * as vscode from 'vscode';

import { ContainerCli, ImageSummary } from './cli/containerCli';
import { AppleContainerError, ErrorCode } from './core/errors';
import { events } from './core/events';
import { log, logError } from './core/logger';
import { handleWorkspaceAutoStart } from './core/workspaceAutoStart';
import { ImageTreeItem, ImagesTreeProvider } from './views/imageTree';
import { ContainerTreeItem, ContainersTreeProvider } from './views/containerTree';
import { ContainerCreateWizard } from './views/containerCreateWizard';
import { SystemTreeProvider, SystemTreeItem } from './views/systemTree';
import { fetchLatestRelease } from './updater/githubClient';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating Apple Container Manager extension');

  const cli = new ContainerCli();
  const systemProvider = new SystemTreeProvider();
  const containersProvider = new ContainersTreeProvider(cli);
  const imagesProvider = new ImagesTreeProvider(cli);

  context.subscriptions.push(
    systemProvider,
    containersProvider,
    imagesProvider,
    vscode.window.registerTreeDataProvider('appleContainerSystem', systemProvider),
    vscode.window.registerTreeDataProvider('appleContainerContainers', containersProvider),
    vscode.window.registerTreeDataProvider('appleContainerImages', imagesProvider)
  );

  const cliReady = await initializeCli(cli, containersProvider, imagesProvider);
  if (cliReady) {
    await handleWorkspaceAutoStart(cli);
    await refreshSystemStatus(cli, containersProvider, imagesProvider, { refreshResources: true, requestedRunning: true });
  }

  registerCommands(context, cli, systemProvider, containersProvider, imagesProvider);
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
  imagesProvider: ImagesTreeProvider
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
        await cli.stopContainer(item.container.id);
        await containersProvider.refresh();
        void vscode.window.showInformationMessage(`Container ${identifier} stopped.`);
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
      });
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

async function withCommandHandling(message: string, action: () => Promise<void>): Promise<void> {
  log(message);
  try {
    await action();
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
