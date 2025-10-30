import * as vscode from 'vscode';

import { events } from './events';

type StatusPayload = { running: boolean; version?: string };

export class StatusBarManager implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  private readonly statusListener: (payload: StatusPayload) => void;

  constructor() {
    this.item.text = '$(server-environment) Apple Container: Checking…';
    this.item.tooltip = 'Apple container system status';
    this.item.show();

    this.statusListener = payload => this.update(payload);
    events.on('system:status', this.statusListener);
  }

  setRunning(version?: string): void {
    this.update({ running: true, version });
  }

  setStopped(version?: string): void {
    this.update({ running: false, version });
  }

  setError(message: string): void {
    this.item.text = `$(warning) ${message}`;
    this.item.tooltip = message;
  }

  dispose(): void {
    this.item.dispose();
    events.off('system:status', this.statusListener);
  }

  private update(payload: StatusPayload): void {
    const versionLabel = payload.version ? ` · ${payload.version}` : '';
    if (payload.running) {
      this.item.text = `$(server-environment) Running${versionLabel}`;
      this.item.tooltip = `Apple container system is running${versionLabel ? ` (CLI ${payload.version})` : ''}`;
    } else {
      this.item.text = `$(circle-slash) Stopped${versionLabel}`;
      this.item.tooltip = `Apple container system is stopped${versionLabel ? ` (CLI ${payload.version})` : ''}`;
    }
  }
}

