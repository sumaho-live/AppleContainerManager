import * as vscode from 'vscode';

import { ContainerCli, ContainerSummary, ImageSummary } from '../cli/containerCli';
import { events, SystemStatusPayload } from '../core/events';
import { log, logError } from '../core/logger';

export class ImageTreeItem extends vscode.TreeItem {
  constructor(public readonly image: ImageSummary, private readonly actionsEnabled: boolean) {
    const label = image.repository?.trim().length ? image.repository : 'Unknown image';
    super(label, vscode.TreeItemCollapsibleState.None);

    if (image.id === 'empty-images') {
      this.label = 'No images found';
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'image-info';
      this.tooltip = 'No images detected from Apple container CLI';
      return;
    }

    this.description = image.tag ?? undefined;
    const lines = [
      `Repository: ${image.repository}`,
      image.tag ? `Version: ${image.tag}` : undefined,
      `Image ID: ${image.id}`,
      image.digest ? `Digest: ${image.digest}` : undefined,
      image.size ? `Size: ${image.size}` : undefined,
      image.createdAt ? `Created: ${image.createdAt}` : undefined
    ].filter(Boolean);
    this.tooltip = lines.join('\n');
    if (!this.actionsEnabled) {
      this.contextValue = 'image-disabled';
    } else if (image.inUse) {
      this.contextValue = 'image-in-use';
    } else {
      this.contextValue = 'image-deletable';
    }
    this.iconPath = new vscode.ThemeIcon('package');
  }
}

export class ImagesTreeProvider implements vscode.TreeDataProvider<ImageTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ImageTreeItem | undefined | null | void>();
  private items: ImageSummary[] = [];
  private serviceRunning = false;
  private usedImageRefs = new Set<string>();
  private statusKnown = false;
  private readonly statusListener: (payload: SystemStatusPayload) => void;
  private readonly containersListener: (containers: ContainerSummary[]) => void;

  constructor(
    private readonly cli: ContainerCli
  ) {
    this.statusListener = payload => {
      this.statusKnown = true;
      this.serviceRunning = payload.running;
      if (!payload.running) {
        log('System reported stopped; clearing image list to avoid stale data');
        this.items = [];
        this.usedImageRefs.clear();
        this.emitter.fire();
        return;
      }
    };
    events.on('system:status', this.statusListener);
    this.containersListener = containers => {
      this.updateUsedImageRefs(containers);
      this.applyUsageFlags();
      this.emitter.fire();
    };
    events.on('data:containers', this.containersListener);
  }

  readonly onDidChangeTreeData: vscode.Event<ImageTreeItem | undefined | null | void> = this.emitter.event;

  async refresh(): Promise<void> {
    if (!this.serviceRunning) {
      log('Skipping image refresh because system service is not running');
      this.items = [];
      this.usedImageRefs.clear();
      this.emitter.fire();
      return;
    }

    try {
      const images = await this.cli.listImages();
      this.items = images;
      this.applyUsageFlags();
      events.emit('data:images', this.items);
      log(`Images refreshed (${this.items.length})`);
      if (this.items.length > 0) {
        const preview = this.items.map(image => `${image.repository}:${image.tag}`).join(', ');
        log(`Image inventory: ${preview}`);
      }
      this.emitter.fire();
    } catch (error) {
      logError('Unable to refresh images', error);
      this.emitter.fire();
    }
  }

  getTreeItem(element: ImageTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ImageTreeItem[]> {
    if (!this.statusKnown) {
      return [
        new ImageTreeItem({
          id: 'empty-images',
          repository: 'Detecting images…',
          tag: 'Pending',
          size: undefined
        }, false)
      ];
    }

    if (!this.serviceRunning) {
      return [
        new ImageTreeItem({
          id: 'empty-images',
          repository: 'Start the Apple container system to view images',
          tag: 'Unavailable',
          size: undefined
        }, false)
      ];
    }

    if (this.items.length === 0) {
      return [
        new ImageTreeItem({
          id: 'empty-images',
          repository: 'No images',
          tag: 'available',
          size: undefined
        }, false)
      ];
    }

    return this.items.map(item => new ImageTreeItem(item, this.serviceRunning));
  }

  dispose(): void {
    events.off('system:status', this.statusListener);
    events.off('data:containers', this.containersListener);
    this.emitter.dispose();
  }

  getCurrentImages(): ImageSummary[] {
    return this.items.slice();
  }

  private updateUsedImageRefs(containers: ContainerSummary[]): void {
    const refs = new Set<string>();
    for (const container of containers) {
      const candidates = this.expandContainerReference(container.image);
      for (const candidate of candidates) {
        refs.add(candidate);
      }
    }
    this.usedImageRefs = refs;
  }

  private applyUsageFlags(): void {
    if (this.items.length === 0) {
      return;
    }

    this.items = this.items.map(image => ({
      ...image,
      inUse: this.isImageInUse(image)
    }));
  }

  private isImageInUse(image: ImageSummary): boolean {
    const candidates = this.expandImageSummary(image);
    return candidates.some(candidate => this.usedImageRefs.has(candidate));
  }

  private expandContainerReference(value?: string): string[] {
    if (!value) {
      return [];
    }
    const normalized = this.normalizeRef(value);
    if (!normalized) {
      return [];
    }

    const variants = new Set<string>();
    variants.add(normalized);

    const withoutDigest = normalized.split('@')[0];
    if (withoutDigest && withoutDigest !== normalized) {
      variants.add(withoutDigest);
    }

    const strippedRegistry = this.stripRegistry(withoutDigest ?? normalized);
    if (strippedRegistry) {
      variants.add(strippedRegistry);
    }

    return Array.from(variants);
  }

  private expandImageSummary(image: ImageSummary): string[] {
    const variants = new Set<string>();

    const repository = this.normalizeRef(image.repository);
    const tag = this.normalizeRef(image.tag);
    const digest = this.normalizeRef(image.digest);
    const id = this.normalizeRef(image.id);

    if (repository && tag) {
      variants.add(`${repository}:${tag}`);
    }
    if (repository) {
      variants.add(repository);
      const stripped = this.stripRegistry(repository);
      if (stripped) {
        variants.add(stripped);
        if (tag) {
          variants.add(`${stripped}:${tag}`);
        }
      }
    }
    if (tag && !variants.has(tag)) {
      variants.add(tag);
    }
    if (digest) {
      variants.add(digest);
    }
    if (id) {
      variants.add(id);
    }

    return Array.from(variants);
  }

  private normalizeRef(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.toLowerCase();
  }

  private stripRegistry(reference: string): string | undefined {
    const slashIndex = reference.indexOf('/');
    if (slashIndex === -1) {
      return undefined;
    }
    return reference.slice(slashIndex + 1);
  }
}
