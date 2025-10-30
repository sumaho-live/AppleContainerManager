import * as vscode from 'vscode';

import { ContainerCli } from '../cli/containerCli';
import { log, logError } from './logger';
import { AppleContainerError, ErrorCode } from './errors';

export const handleWorkspaceAutoStart = async (cli: ContainerCli): Promise<void> => {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return;
  }

  await Promise.all(
    folders.map(async folder => {
      const config = vscode.workspace.getConfiguration(undefined, folder.uri);
      const enabled = config.get<boolean>('appleContainer.system.autoStartOnWorkspaceOpen');

      if (!enabled) {
        return;
      }

      log(`Auto-start enabled for workspace ${folder.name}`);
      try {
        await cli.system('start');
      } catch (error) {
        const containerError = error instanceof AppleContainerError ? error : new AppleContainerError('Failed to auto-start system', ErrorCode.CommandFailed, error);
        logError(`Auto-start failed for workspace ${folder.name}`, containerError);
        if (containerError.code === ErrorCode.CliNotFound) {
          void vscode.window.showErrorMessage('Apple container CLI not found. Disable auto-start or install the CLI.');
        }
      }
    })
  );
};

