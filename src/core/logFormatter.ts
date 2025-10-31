import * as vscode from 'vscode';

export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'success' | 'unknown';
export type LogStream = 'stdout' | 'stderr' | 'system';
export type LogSource = 'system' | 'container';

export interface LogLineDescriptor {
  timestamp: Date;
  tag: string;
  message: string;
  source: LogSource;
  stream?: LogStream;
  level?: LogSeverity;
}

export interface FormattedLogLine {
  colored: string;
  plain: string;
  severity: LogSeverity;
}

export class LogFormatter implements vscode.Disposable {
  private timestampFormatter = this.createTimestampFormatter();
  private showTimestamps = this.readShowTimestampsSetting();
  private readonly configurationListener: vscode.Disposable;

  constructor() {
    this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('appleContainer.logs.showTimestamps')) {
        this.showTimestamps = this.readShowTimestampsSetting();
        this.timestampFormatter = this.createTimestampFormatter();
      }
    });
  }

  format(line: LogLineDescriptor): FormattedLogLine {
    const severity = line.level ?? this.detectSeverity(line);
    const timestampPlain = this.showTimestamps ? `[${this.timestampFormatter.format(line.timestamp)}]` : undefined;
    const tagPlain = `[${line.tag}]`;
    const levelPlain = severity ? `[${severity.toUpperCase()}]` : undefined;
    const streamPlain = line.stream && line.stream !== 'system' ? `(${line.stream})` : undefined;

    const plainPrefix = [tagPlain, timestampPlain, levelPlain, streamPlain].filter(Boolean).join('');
    const coloredPrefix = plainPrefix;

    const plain = `${plainPrefix} ${line.message}`.trim();
    const colored = `${coloredPrefix} ${line.message}`.trim();

    return { colored, plain, severity };
  }

  formatSystem(message: string, level: LogSeverity = 'info'): FormattedLogLine {
    return this.format({
      message,
      source: 'system',
      tag: 'ACM',
      timestamp: new Date(),
      stream: 'system',
      level
    });
  }

  dispose(): void {
    this.configurationListener.dispose();
  }

  private detectSeverity(line: LogLineDescriptor): LogSeverity {
    if (line.stream === 'stderr') {
      return 'error';
    }
    if (line.stream === 'system') {
      return this.inferSeverity(line.message);
    }
    return this.inferSeverity(line.message);
  }

  private inferSeverity(message: string): LogSeverity {
    const upper = message.toUpperCase();
    if (/\b(ERROR|FAILED|FAILURE|CRITICAL)\b/.test(upper)) {
      return 'error';
    }
    if (/\b(WARN|WARNING)\b/.test(upper)) {
      return 'warn';
    }
    if (/\b(SUCCESS|STARTED|RUNNING|READY|COMPLETED)\b/.test(upper)) {
      return 'success';
    }
    if (/\b(INFO|INFORMATION)\b/.test(upper)) {
      return 'info';
    }
    if (/\b(DEBUG|TRACE)\b/.test(upper)) {
      return 'debug';
    }
    return 'unknown';
  }

  private createTimestampFormatter(): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  private readShowTimestampsSetting(): boolean {
    return vscode.workspace.getConfiguration('appleContainer.logs').get<boolean>('showTimestamps', true);
  }
}

export const logFormatter = new LogFormatter();
