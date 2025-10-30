import * as vscode from 'vscode';

import { ContainerCli, ContainerSummary } from '../cli/containerCli';
import { events } from '../core/events';
import { log, logError } from '../core/logger';

export class ContainerTreeItem extends vscode.TreeItem {
  constructor(public readonly container: ContainerSummary) {
    const label = container.name?.trim().length ? container.name : container.id ?? 'Unnamed container';
    super(label, vscode.TreeItemCollapsibleState.None);

    const statusLabel = container.status?.trim().length ? container.status : 'Unknown';
    const detailParts = [statusLabel, container.image].filter(Boolean);
    this.description = detailParts.join(' · ');
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
    this.contextValue = isRunning ? 'container-running' : 'container-stopped';
    this.iconPath = isRunning ? new vscode.ThemeIcon('play-circle') : new vscode.ThemeIcon('circle-slash');
  }

  private buildTooltip(container: ContainerSummary): string {
    const lines = [
      `Image: ${container.image}`,
      container.status ? `State: ${container.status}` : undefined,
      container.address ? `Address: ${container.address}` : undefined,
      container.ports ? `Ports: ${container.ports}` : undefined,
      container.cpus ? `CPUs: ${container.cpus}` : undefined,
      container.memory ? `Memory: ${container.memory}` : undefined,
      container.os ? `OS: ${container.os}` : undefined,
      container.arch ? `Arch: ${container.arch}` : undefined,
      container.createdAt ? `Created: ${container.createdAt}` : undefined
    ].filter(Boolean);
    return lines.join('\n');
  }
}

export class ContainersTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem> {
  private readonly emitter = new vscode.EventEmitter<ContainerTreeItem | undefined | null | void>();
  private items: ContainerSummary[] = [];

  constructor(private readonly cli: ContainerCli) {}

  readonly onDidChangeTreeData: vscode.Event<ContainerTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
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
    }
  }

  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ContainerTreeItem[]> {
    if (this.items.length === 0) {
      return [new ContainerTreeItem({ id: 'empty-containers', name: 'No containers found', image: 'n/a', status: 'Unavailable' })];
    }

    return this.items.map(item => new ContainerTreeItem(item));
  }
}
