import * as vscode from 'vscode';

import { ContainerCli, ImageSummary } from '../cli/containerCli';
import { CacheStore } from '../core/cache';
import { events, SystemStatusPayload } from '../core/events';
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

export class ImagesTreeProvider implements vscode.TreeDataProvider<ImageTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ImageTreeItem | undefined | null | void>();
  private items: ImageSummary[] = [];
  private serviceRunning = false;
  private readonly statusListener: (payload: SystemStatusPayload) => void;

  constructor(
    private readonly cli: ContainerCli,
    private readonly cache: CacheStore
  ) {
    this.statusListener = payload => {
      this.serviceRunning = payload.running;
      if (!payload.running) {
        log('System reported stopped; loading images from cache');
        this.items = this.cache.getImages();
        this.emitter.fire();
      }
    };
    events.on('system:status', this.statusListener);
    this.items = this.cache.getImages();
    if (this.items.length > 0) {
      log(`Image cache primed with ${this.items.length} entries`);
    }
  }

  readonly onDidChangeTreeData: vscode.Event<ImageTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
    if (!this.serviceRunning) {
      this.items = this.cache.getImages();
      if (this.items.length > 0) {
        log(`Images loaded from cache (${this.items.length})`);
      } else {
        log('No cached images available while system stopped');
      }
      this.emitter.fire();
      return;
    }

    try {
      const images = await this.cli.listImages();
      this.items = images;
      events.emit('data:images', images);
      await this.cache.setImages(images);
      log(`Images refreshed (${images.length})`);
      if (images.length > 0) {
        const preview = images.map(image => `${image.repository}:${image.tag}`).join(', ');
        log(`Image inventory: ${preview}`);
      }
      this.emitter.fire();
    } catch (error) {
      logError('Unable to refresh images', error);
      const cached = this.cache.getImages();
      if (cached.length > 0) {
        log('Falling back to cached images after refresh failure');
        this.items = cached;
        this.emitter.fire();
      }
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

  dispose(): void {
    events.off('system:status', this.statusListener);
    this.emitter.dispose();
  }
}
