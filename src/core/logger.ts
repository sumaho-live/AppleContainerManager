import * as vscode from 'vscode';
import { logFormatter, LogSeverity } from './logFormatter';

const outputChannel = vscode.window.createOutputChannel('Apple Containers');
const LEVEL_ORDER: Record<LogSeverity, number> = {
  debug: 10,
  info: 20,
  success: 25,
  warn: 30,
  error: 40,
  trace: 15,
  unknown: 5
};

let minimumLevelSetting: LogSeverity = readMinimumLevel();

vscode.workspace.onDidChangeConfiguration(event => {
  if (event.affectsConfiguration('appleContainer.logs.minimumLevel')) {
    minimumLevelSetting = readMinimumLevel();
  }
});

export const getOutputChannel = (): vscode.OutputChannel => outputChannel;

export const log = (message: string): void => {
  logWithLevel('debug', message);
};

export const logCommand = (command: string, args: readonly string[]): void => {
  logDebug(`$ ${command} ${args.join(' ')}`.trim());
};

export const logError = (message: string, error?: unknown): void => {
  const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  logWithLevel('error', `${message} — ${errorMessage}`);
};

export const logDebug = (message: string): void => {
  logWithLevel('debug', message);
};

export const logInfo = (message: string): void => {
  logWithLevel('info', message);
};

export const logWarn = (message: string): void => {
  logWithLevel('warn', message);
};

export const logSuccess = (message: string): void => {
  logWithLevel('success', message);
};

const logWithLevel = (level: LogSeverity, message: string): void => {
  if (!shouldLog(level)) {
    return;
  }
  const formatted = logFormatter.formatSystem(message, level);
  outputChannel.appendLine(formatted.colored);
};

function shouldLog(level: LogSeverity): boolean {
  const target = LEVEL_ORDER[level] ?? LEVEL_ORDER.unknown;
  const threshold = LEVEL_ORDER[minimumLevelSetting] ?? LEVEL_ORDER.info;
  return target >= threshold;
}

function readMinimumLevel(): LogSeverity {
  const configured = vscode.workspace.getConfiguration('appleContainer.logs').get<LogSeverity>('minimumLevel', 'info');
  return configured ?? 'info';
}
