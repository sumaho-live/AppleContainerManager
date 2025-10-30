import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('Apple Containers');

export const getOutputChannel = (): vscode.OutputChannel => outputChannel;

export const log = (message: string): void => {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
};

export const logCommand = (command: string, args: readonly string[]): void => {
  log(`$ ${command} ${args.join(' ')}`.trim());
};

export const logError = (message: string, error?: unknown): void => {
  const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  log(`ERROR: ${message} — ${errorMessage}`);
};

