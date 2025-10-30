import * as vscode from 'vscode';

import { ContainerCli, ImageSummary } from '../cli/containerCli';
import { events } from '../core/events';
import { log, logError } from '../core/logger';

export class ImageTreeItem extends vscode.TreeItem {
  constructor(public readonly image: ImageSummary) {
    const label = image.repository?.trim().length ? image.repository : 'Unknown image';
    super(label, vscode.TreeItemCollapsibleState.None);

    if (image.id === 'empty-images') {
      this.label = 'No images found';
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'image-info';
      this.tooltip = 'No images detected from Apple container CLI';
      return;
    }

    this.description = undefined;
    const lines = [
      `Repository: ${image.repository}`,
      image.tag ? `Version: ${image.tag}` : undefined,
      `Image ID: ${image.id}`,
      image.digest ? `Digest: ${image.digest}` : undefined,
      image.size ? `Size: ${image.size}` : undefined,
      image.createdAt ? `Created: ${image.createdAt}` : undefined
    ].filter(Boolean);
    this.tooltip = lines.join('\n');
    this.contextValue = 'image';
    this.iconPath = new vscode.ThemeIcon('package');
  }
}

export class ImagesTreeProvider implements vscode.TreeDataProvider<ImageTreeItem> {
  private readonly emitter = new vscode.EventEmitter<ImageTreeItem | undefined | null | void>();
  private items: ImageSummary[] = [];

  constructor(private readonly cli: ContainerCli) {}

  readonly onDidChangeTreeData: vscode.Event<ImageTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
    try {
      const images = await this.cli.listImages();
      this.items = images;
      events.emit('data:images', images);
      log(`Images refreshed (${images.length})`);
      if (images.length > 0) {
        const preview = images.map(image => `${image.repository}:${image.tag}`).join(', ');
        log(`Image inventory: ${preview}`);
      }
      this.emitter.fire();
    } catch (error) {
      logError('Unable to refresh images', error);
    }
  }

  getTreeItem(element: ImageTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ImageTreeItem[]> {
    if (this.items.length === 0) {
      return [
        new ImageTreeItem({
          id: 'empty-images',
          repository: 'No images',
          tag: 'available',
          size: undefined
        })
      ];
    }

    return this.items.map(item => new ImageTreeItem(item));
  }
}
