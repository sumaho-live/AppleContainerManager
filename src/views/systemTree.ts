import * as vscode from 'vscode';

import { events, SystemStatusPayload } from '../core/events';
import { log } from '../core/logger';

interface SystemNode {
  id: string;
  label: string;
  description?: string;
  context: string;
  iconId?: string;
  tooltip?: string;
  latestUrl?: string;
}

export class SystemTreeItem extends vscode.TreeItem {
  constructor(public readonly node: SystemNode) {
    super(node.label, vscode.TreeItemCollapsibleState.None);
    this.description = node.description;
    this.contextValue = node.context;
    this.tooltip = node.tooltip;
    if (node.iconId) {
      this.iconPath = new vscode.ThemeIcon(node.iconId);
    } else if (node.context === 'system-running') {
      this.iconPath = new vscode.ThemeIcon('server-environment');
    } else if (node.context === 'system-stopped') {
      this.iconPath = new vscode.ThemeIcon('circle-slash');
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }

  get latestUrl(): string | undefined {
    return this.node.latestUrl;
  }
}

export class SystemTreeProvider implements vscode.TreeDataProvider<SystemTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<SystemTreeItem | undefined | null | void>();
  private running = false;
  private localVersion: string | undefined;
  private latestVersion: string | undefined;
  private latestUrl: string | undefined;
  private updateAvailable = false;
  private readonly statusListener: (payload: SystemStatusPayload) => void;

  constructor() {
    this.statusListener = payload => {
      log(`System status event received (running=${payload.running}, localVersion=${payload.localVersion ?? 'unknown'}, latest=${payload.latestVersion ?? 'unknown'}, updateAvailable=${payload.updateAvailable ?? false})`);
      this.running = payload.running;
      this.localVersion = payload.localVersion;
      this.latestVersion = payload.latestVersion;
      this.latestUrl = payload.latestUrl;
      this.updateAvailable = payload.updateAvailable ?? false;
      this.syncContexts();
      this.emitter.fire();
    };

    void vscode.commands.executeCommand('setContext', 'appleContainer.system.running', this.running);
    void vscode.commands.executeCommand('setContext', 'appleContainer.system.updateAvailable', this.updateAvailable);
    void vscode.commands.executeCommand('setContext', 'appleContainer.system.hasLatest', Boolean(this.latestVersion));
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
        description: this.localVersion ? `CLI ${this.localVersion}` : undefined,
        context: this.running ? 'system-running' : 'system-stopped',
        iconId: this.running ? 'server-environment' : 'circle-slash',
        tooltip: this.localVersion ? `Detected CLI version ${this.localVersion}` : 'CLI version unavailable'
      },
      {
        id: 'system-latest',
        label: `GitHub Release: ${this.latestVersion ?? 'unknown'}`,
        description: this.updateAvailable ? 'Update available' : 'Up to date',
        context: this.updateAvailable ? 'system-upgrade-available' : 'system-upgrade-current',
        iconId: this.updateAvailable ? 'cloud-download' : 'cloud-check',
        tooltip: this.buildLatestTooltip(),
        latestUrl: this.latestUrl
      }
    ];

    return nodes.map(node => new SystemTreeItem(node));
  }

  dispose(): void {
    events.off('system:status', this.statusListener);
    this.emitter.dispose();
  }

  getLatestReleaseUrl(): string | undefined {
    return this.latestUrl;
  }

  private buildLatestTooltip(): string {
    if (!this.latestVersion) {
      return 'Latest GitHub release version unavailable.';
    }

    if (!this.localVersion) {
      return `Latest GitHub release: ${this.latestVersion}.`;
    }

    if (this.updateAvailable) {
      return `New release ${this.latestVersion} is available. Current CLI ${this.localVersion}. Use the upgrade button to update.`;
    }

    return `You are on the latest release (${this.localVersion}).`;
  }

  private syncContexts(): void {
    void vscode.commands.executeCommand('setContext', 'appleContainer.system.running', this.running);
    void vscode.commands.executeCommand('setContext', 'appleContainer.system.updateAvailable', this.updateAvailable);
    void vscode.commands.executeCommand('setContext', 'appleContainer.system.hasLatest', Boolean(this.latestVersion));
  }
}
