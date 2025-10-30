import * as vscode from 'vscode';

import { events } from '../core/events';
import { log } from '../core/logger';

interface SystemNode {
  id: string;
  label: string;
  description?: string;
  context: string;
}

export class SystemTreeItem extends vscode.TreeItem {
  constructor(node: SystemNode) {
    super(node.label, vscode.TreeItemCollapsibleState.None);
    this.description = node.description;
    this.contextValue = node.context;
    this.iconPath = node.context === 'system-running'
      ? new vscode.ThemeIcon('server-environment')
      : node.context === 'system-stopped'
        ? new vscode.ThemeIcon('circle-slash')
        : new vscode.ThemeIcon('info');
  }
}

export class SystemTreeProvider implements vscode.TreeDataProvider<SystemTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<SystemTreeItem | undefined | null | void>();
  private running = false;
  private version: string | undefined;
  private readonly statusListener: (payload: { running: boolean; version?: string }) => void;

  constructor() {
    this.statusListener = payload => {
      log(`System status event received (running=${payload.running}, version=${payload.version ?? 'unknown'})`);
      this.running = payload.running;
      this.version = payload.version;
      this.emitter.fire();
    };

    events.on('system:status', this.statusListener);
  }

  readonly onDidChangeTreeData: vscode.Event<SystemTreeItem | undefined | null | void> = this.emitter.event;

  getTreeItem(element: SystemTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<SystemTreeItem[]> {
    const nodes: SystemNode[] = [
      {
        id: 'system-status',
        label: this.running ? 'System Service: Running' : 'System Service: Stopped',
        description: this.version ? `CLI ${this.version}` : undefined,
        context: this.running ? 'system-running' : 'system-stopped'
      }
    ];

    return nodes.map(node => new SystemTreeItem(node));
  }

  dispose(): void {
    events.off('system:status', this.statusListener);
    this.emitter.dispose();
  }
}
