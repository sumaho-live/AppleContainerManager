import * as vscode from 'vscode';

import { ContainerCli, ContainerSummary } from '../cli/containerCli';
import { CacheStore } from '../core/cache';
import { events, SystemStatusPayload } from '../core/events';
import { log, logError } from '../core/logger';

export class ContainerTreeItem extends vscode.TreeItem {
  constructor(public readonly container: ContainerSummary, private readonly actionsEnabled: boolean) {
    const label = container.name?.trim().length ? container.name : container.id ?? 'Unnamed container';
    super(label, vscode.TreeItemCollapsibleState.None);

    const statusLabel = container.status?.trim().length ? container.status : 'Unknown';
    const detailParts = [container.image].filter(Boolean);
    this.description = detailParts.length > 0 ? detailParts.join(' · ') : undefined;
    this.tooltip = container.id === 'empty-containers'
      ? 'No containers detected from Apple container CLI'
      : this.buildTooltip(container);

    if (container.id === 'empty-containers') {
      this.contextValue = 'container-info';
      this.iconPath = new vscode.ThemeIcon('info');
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      return;
    }

    const normalizedStatus = statusLabel.toLowerCase();
    const isRunning = normalizedStatus.startsWith('running') || normalizedStatus === 'up';
    const baseContext = isRunning ? 'container-running' : 'container-stopped';
    this.contextValue = this.actionsEnabled ? baseContext : `${baseContext}-disabled`;
    this.iconPath = isRunning ? new vscode.ThemeIcon('debug-start') : new vscode.ThemeIcon('debug-stop');
  }

  private buildTooltip(container: ContainerSummary): string {
    const lines = [
      `Image: ${container.image}`,
      container.status ? `State: ${container.status}` : undefined,
      container.ipAddress ? `IP Address: ${container.ipAddress}` : undefined,
      container.address ? `Network: ${container.address}` : undefined,
      container.ports ? `Ports: ${container.ports}` : undefined,
      container.volumes ? `Volumes: ${container.volumes}` : undefined,
      container.cpus ? `CPUs: ${container.cpus}` : undefined,
      container.memory ? `Memory: ${container.memory}` : undefined,
      container.os ? `OS: ${container.os}` : undefined,
      container.arch ? `Arch: ${container.arch}` : undefined,
      container.createdAt ? `Created: ${container.createdAt}` : undefined
    ].filter(Boolean);
    return lines.join('\n');
  }
}

export class ContainersTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ContainerTreeItem | undefined | null | void>();
  private items: ContainerSummary[] = [];
  private serviceRunning = false;
  private readonly statusListener: (payload: SystemStatusPayload) => void;

  constructor(
    private readonly cli: ContainerCli,
    private readonly cache: CacheStore
  ) {
    this.statusListener = payload => {
      this.serviceRunning = payload.running;
      if (!payload.running) {
        log('System reported stopped; loading containers from cache');
        this.items = this.cache.getContainers();
        this.emitter.fire();
      }
    };
    events.on('system:status', this.statusListener);
    this.items = this.cache.getContainers();
    if (this.items.length > 0) {
      log(`Container cache primed with ${this.items.length} entries`);
    }
  }

  readonly onDidChangeTreeData: vscode.Event<ContainerTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
    if (!this.serviceRunning) {
      this.items = this.cache.getContainers();
      if (this.items.length > 0) {
        log(`Containers loaded from cache (${this.items.length})`);
      } else {
        log('No cached containers available while system stopped');
      }
      this.emitter.fire();
      return;
    }

    try {
      const containers = await this.cli.listContainers();
      this.items = containers;
      events.emit('data:containers', containers);
      await this.cache.setContainers(containers);
      log(`Containers refreshed (${containers.length})`);
      if (containers.length > 0) {
        const preview = containers.map(container => `${container.name} [${container.status}]`).join(', ');
        log(`Container inventory: ${preview}`);
      }
      this.emitter.fire();
    } catch (error) {
      logError('Unable to refresh containers', error);
      const cached = this.cache.getContainers();
      if (cached.length > 0) {
        log('Falling back to cached containers after refresh failure');
        this.items = cached;
        this.emitter.fire();
      }
    }
  }

  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ContainerTreeItem[]> {
    if (this.items.length === 0) {
      return [
        new ContainerTreeItem(
          { id: 'empty-containers', name: 'No containers found', image: 'n/a', status: 'Unavailable' },
          false
        )
      ];
    }

    return this.items.map(item => new ContainerTreeItem(item, this.serviceRunning));
  }

  dispose(): void {
    events.off('system:status', this.statusListener);
    this.emitter.dispose();
  }
}
