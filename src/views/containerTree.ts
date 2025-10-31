import * as vscode from 'vscode';

import { ContainerCli, ContainerSummary } from '../cli/containerCli';
import { events, SystemStatusPayload } from '../core/events';
import { log, logError } from '../core/logger';

export class ContainerTreeItem extends vscode.TreeItem {
  constructor(public readonly container: ContainerSummary, private readonly actionsEnabled: boolean) {
    const label = container.name?.trim().length ? container.name : container.id ?? 'Unnamed container';
    super(label, vscode.TreeItemCollapsibleState.None);

    const statusLabel = container.status?.trim().length ? container.status : 'Unknown';
    const detailParts = [
      container.image,
      this.buildResourceSummary(container),
      this.formatPortSummary(container)
    ].filter((part): part is string => Boolean(part && part.length > 0));
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
    if (!this.actionsEnabled) {
      this.contextValue = `${baseContext}-disabled`;
    } else if (isRunning) {
      this.contextValue = baseContext;
    } else {
      this.contextValue = `${baseContext}-deletable`;
    }
    this.iconPath = isRunning ? new vscode.ThemeIcon('debug-start') : new vscode.ThemeIcon('debug-stop');
  }

  private buildTooltip(container: ContainerSummary): string {
    const resourceSummary = this.buildResourceSummary(container);
    const portSummary = this.formatPortSummary(container);
    const lines = [
      `Image: ${container.image}`,
      container.status ? `State: ${container.status}` : undefined,
      resourceSummary ? `Resources: ${resourceSummary}` : undefined,
      portSummary ? `Ports: ${portSummary}` : undefined,
      container.ipAddress ? `IP Address: ${container.ipAddress}` : undefined,
      container.address ? `Network: ${container.address}` : undefined,
      container.volumes ? `Volumes: ${container.volumes}` : undefined,
      container.os ? `OS: ${container.os}` : undefined,
      container.arch ? `Arch: ${container.arch}` : undefined,
      container.createdAt ? `Created: ${container.createdAt}` : undefined
    ].filter(Boolean);
    return lines.join('\n');
  }

  private buildResourceSummary(container: ContainerSummary): string | undefined {
    const archRaw = container.arch ?? container.os;
    const arch = archRaw ? archRaw.charAt(0).toUpperCase() + archRaw.slice(1) : undefined;
    const cpus = container.cpus?.trim() ?? undefined;
    const memory = container.memory?.trim()?.toUpperCase() ?? undefined;
    const parts = [arch, cpus, memory].filter((part): part is string => Boolean(part && part.length > 0));
    return parts.length > 0 ? parts.join('/') : undefined;
  }

  private formatPortSummary(container: ContainerSummary): string | undefined {
    return container.ports?.trim() ?? undefined;
  }
}

export class ContainersTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ContainerTreeItem | undefined | null | void>();
  private items: ContainerSummary[] = [];
  private serviceRunning = false;
  private statusKnown = false;
  private readonly statusListener: (payload: SystemStatusPayload) => void;

  constructor(
    private readonly cli: ContainerCli
  ) {
    this.statusListener = payload => {
      this.statusKnown = true;
      this.serviceRunning = payload.running;
      if (!payload.running) {
        log('System reported stopped; clearing container list to avoid stale data');
        this.items = [];
        events.emit('data:containers', []);
        this.emitter.fire();
        return;
      }
      this.emitter.fire();
    };
    events.on('system:status', this.statusListener);
  }

  readonly onDidChangeTreeData: vscode.Event<ContainerTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
    if (!this.serviceRunning) {
      log('Skipping container refresh because system service is not running');
      this.items = [];
      this.emitter.fire();
      return;
    }

    try {
      const containers = await this.cli.listContainers();
      this.items = containers;
      events.emit('data:containers', containers);
      log(`Containers refreshed (${containers.length})`);
      if (containers.length > 0) {
        const preview = containers.map(container => `${container.name} [${container.status}]`).join(', ');
        log(`Container inventory: ${preview}`);
      }
      this.emitter.fire();
    } catch (error) {
      logError('Unable to refresh containers', error);
      this.emitter.fire();
    }
  }

  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ContainerTreeItem[]> {
    if (!this.statusKnown) {
      return [
        new ContainerTreeItem(
          { id: 'empty-containers', name: 'Detecting containers…', image: 'n/a', status: 'Pending' },
          false
        )
      ];
    }

    if (!this.serviceRunning) {
      return [
        new ContainerTreeItem(
          { id: 'empty-containers', name: 'Start the Apple container system to view containers', image: 'n/a', status: 'Unavailable' },
          false
        )
      ];
    }

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
