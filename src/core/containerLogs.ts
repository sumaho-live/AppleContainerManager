import { ChildProcessWithoutNullStreams } from 'node:child_process';
import * as vscode from 'vscode';

import { ContainerCli } from '../cli/containerCli';
import { log, logError, getOutputChannel } from './logger';
import type { LogSeverity } from './logFormatter';

export interface ContainerLogEntry {
  containerId: string;
  timestamp: Date;
  message: string;
  stream: 'stdout' | 'stderr';
  severity: LogSeverity;
  plain: string;
}

interface LogSession {
  process: ChildProcessWithoutNullStreams;
  buffer: string;
  label: string;
  stopping: boolean;
  entries: ContainerLogEntry[];
}

export interface ContainerLogStateEvent {
  containerId: string;
  streaming: boolean;
  reason?: 'stopped' | 'closed' | 'error';
}

export class ContainerLogManager implements vscode.Disposable {
  private readonly sessions = new Map<string, LogSession>();
  private readonly stateEmitter = new vscode.EventEmitter<ContainerLogStateEvent>();
  private readonly history = new Map<string, ContainerLogEntry[]>();

  constructor(private readonly cli: ContainerCli) {}

  readonly onDidChangeState = this.stateEmitter.event;

  isStreaming(containerId: string): boolean {
    return this.sessions.has(containerId);
  }

  getActiveStreams(): string[] {
    return Array.from(this.sessions.keys());
  }

  getHistory(containerId: string): ContainerLogEntry[] {
    return this.history.get(containerId) ?? [];
  }

  async startStreaming(containerId: string, label?: string): Promise<boolean> {
    if (this.sessions.has(containerId)) {
      log(`Log stream already active for ${containerId}`);
      return false;
    }

    try {
      const process = this.cli.streamContainerLogs(containerId);
      const session: LogSession = {
        process,
        buffer: '',
        label: label ?? containerId,
        stopping: false,
        entries: []
      };
      this.sessions.set(containerId, session);
      this.history.set(containerId, []);
      this.stateEmitter.fire({ containerId, streaming: true });
      log(`Started log stream for ${session.label}`);
      const output = getOutputChannel();
      output.show(true);
      process.stdout.setEncoding('utf8');
      process.stderr.setEncoding('utf8');

      process.stdout.on('data', chunk => this.handleChunk(containerId, session, chunk, false));
      process.stderr.on('data', chunk => this.handleChunk(containerId, session, chunk, true));

      process.once('close', code => {
        this.flushBuffer(containerId, session);
        if (this.sessions.get(containerId) === session) {
          this.sessions.delete(containerId);
          const reason = session.stopping ? 'stopped' : 'closed';
          this.stateEmitter.fire({ containerId, streaming: false, reason });
          log(`Log stream ${reason} for ${session.label}${typeof code === 'number' ? ` (exit ${code})` : ''}`);
        }
      });

      process.once('error', error => {
        logError(`Container log stream error for ${containerId}`, error);
        this.handleStreamError(containerId, session, error);
      });

      return true;
    } catch (error) {
      logError(`Failed to start log stream for ${containerId}`, error);
      this.stateEmitter.fire({ containerId, streaming: false, reason: 'error' });
      return false;
    }
  }

  stopStreaming(containerId: string): boolean {
    const session = this.sessions.get(containerId);
    if (!session) {
      return false;
    }

    session.stopping = true;
    log(`Stopping log stream for ${session.label}`);
    const killed = session.process.kill();
    if (!killed) {
      logError(`Failed to send termination signal to container log stream ${containerId}`);
      return false;
    }

    return true;
  }

  stopAll(): void {
    for (const containerId of Array.from(this.sessions.keys())) {
      this.stopStreaming(containerId);
    }
  }

  dispose(): void {
    this.stopAll();
    this.stateEmitter.dispose();
  }

  private handleChunk(containerId: string, session: LogSession, chunk: string, isErrorStream: boolean): void {
    session.buffer += chunk;
    const lines = session.buffer.split(/\r?\n/);
    session.buffer = lines.pop() ?? '';
    for (const line of lines) {
      this.appendLogLine(containerId, session, line, isErrorStream);
    }
  }

  private flushBuffer(containerId: string, session: LogSession): void {
    if (!session.buffer.trim()) {
      session.buffer = '';
      return;
    }
    this.appendLogLine(containerId, session, session.buffer, false);
    session.buffer = '';
  }

  private appendLogLine(containerId: string, session: LogSession, line: string, isErrorStream: boolean): void {
    if (!line.trim()) {
      return;
    }

    const timestamp = new Date();
    const severity = this.detectSeverity(line, isErrorStream);
    const stream = isErrorStream ? 'stderr' : 'stdout';
    const formattedPlain = `[${containerId}] ${line}`;
    session.entries.push({
      containerId,
      message: line,
      plain: formattedPlain,
      severity,
      stream,
      timestamp
    });
    const historyEntries = this.history.get(containerId);
    if (historyEntries) {
      historyEntries.push({
        containerId,
        message: line,
        plain: formattedPlain,
        severity,
        stream,
        timestamp
      });
    } else {
      this.history.set(containerId, [{
        containerId,
        message: line,
        plain: formattedPlain,
        severity,
        stream,
        timestamp
      }]);
    }
    const output = getOutputChannel();
    output.appendLine(formattedPlain);
  }

  private handleStreamError(containerId: string, session: LogSession, error: unknown): void {
    if (this.sessions.get(containerId) !== session) {
      return;
    }
    this.sessions.delete(containerId);
    this.stateEmitter.fire({ containerId, streaming: false, reason: 'error' });
    log(`Log stream error for ${session.label}: ${error instanceof Error ? error.message : String(error)}`);
  }

  private detectSeverity(message: string, isErrorStream: boolean): LogSeverity {
    if (isErrorStream) {
      return 'error';
    }
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
}
