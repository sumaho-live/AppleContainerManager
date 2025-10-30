import * as vscode from 'vscode';

import { ContainerCli } from './cli/containerCli';
import { AppleContainerError, ErrorCode } from './core/errors';
import { events } from './core/events';
import { log, logError } from './core/logger';
import { StatusBarManager } from './core/statusBar';
import { handleWorkspaceAutoStart } from './core/workspaceAutoStart';
import { ImagesTreeProvider } from './views/imageTree';
import { ContainersTreeProvider } from './views/containerTree';
import { SystemTreeProvider } from './views/systemTree';
import { fetchLatestRelease } from './updater/githubClient';

let statusBar: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Activating Apple Container Manager extension');

  const cli = new ContainerCli();
  statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  const systemProvider = new SystemTreeProvider();
  const containersProvider = new ContainersTreeProvider(cli);
  const imagesProvider = new ImagesTreeProvider(cli);

  context.subscriptions.push(
    systemProvider,
    vscode.window.registerTreeDataProvider('appleContainerSystem', systemProvider),
    vscode.window.registerTreeDataProvider('appleContainerContainers', containersProvider),
    vscode.window.registerTreeDataProvider('appleContainerImages', imagesProvider)
  );

  await initializeCli(cli);
  await handleWorkspaceAutoStart(cli);
  await refreshAll(containersProvider, imagesProvider);

  registerCommands(context, cli, containersProvider, imagesProvider);
  registerErrorHandler(context);
}

export function deactivate(): void {
  statusBar?.dispose();
}

async function initializeCli(cli: ContainerCli): Promise<void> {
  try {
    const version = await cli.version();
    log(`Detected container CLI version ${version}`);
    const running = await cli.getSystemStatus();
    if (running === undefined) {
      log('System status unknown after CLI detection; defaulting to stopped');
      events.emit('system:status', { running: false, version });
    } else {
      log(`System status detected on activation: running=${running}`);
      events.emit('system:status', { running, version });
    }
  } catch (error) {
    const containerError = error instanceof AppleContainerError ? error : new AppleContainerError('Failed to detect container CLI', ErrorCode.Unknown, error);
    logError('Unable to read container CLI version', containerError);
    statusBar?.setError('Apple Container: CLI unavailable');
    const message = containerError.code === ErrorCode.CliNotFound
      ? 'Apple container CLI not found. Install it to enable full functionality.'
      : `Failed to detect Apple container CLI. ${containerError.message}`;
    void vscode.window.showWarningMessage(message);
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  cli: ContainerCli,
  containersProvider: ContainersTreeProvider,
  imagesProvider: ImagesTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('appleContainer.system.start', async () => {
      await withCommandHandling('Starting container system', async () => {
        await cli.system('start');
        await emitStatus(cli, true);
        void vscode.window.showInformationMessage('Apple container system started.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.system.stop', async () => {
      await withCommandHandling('Stopping container system', async () => {
        await cli.system('stop');
        await emitStatus(cli, false);
        void vscode.window.showInformationMessage('Apple container system stopped.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.system.restart', async () => {
      await withCommandHandling('Restarting container system', async () => {
        await cli.system('restart');
        await emitStatus(cli, true);
        void vscode.window.showInformationMessage('Apple container system restarted.');
      });
    }),
    vscode.commands.registerCommand('appleContainer.refresh', async () => {
      await refreshAll(containersProvider, imagesProvider);
      void vscode.window.showInformationMessage('Apple container views refreshed.');
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

async function emitStatus(cli: ContainerCli, running: boolean): Promise<void> {
  try {
    const [version, detectedRunning] = await Promise.all([
      cli.version(),
      cli.getSystemStatus()
    ]);

    const resolvedRunning = detectedRunning ?? running;
    log(`Emitting system status (requested=${running}, detected=${detectedRunning ?? 'unknown'}) with CLI version ${version}`);
    events.emit('system:status', { running: resolvedRunning, version });
  } catch (error) {
    logError('Failed to update system status version information', error);
    log(`Emitting system status (running=${running}) without version due to error`);
    events.emit('system:status', { running });
  }
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
