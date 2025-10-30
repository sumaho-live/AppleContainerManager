import * as vscode from 'vscode';

import { ContainerSummary, ImageSummary } from '../cli/containerCli';
import { log, logError } from './logger';

interface CacheEnvelope<T> {
  data: T;
  updatedAt: number;
}

interface SystemCache {
  localVersion?: string;
  latestVersion?: string;
  latestUrl?: string;
  updateAvailable?: boolean;
}

const KEY_PREFIX = 'appleContainer.cache';
const SYSTEM_KEY = `${KEY_PREFIX}.system`;
const CONTAINERS_KEY = `${KEY_PREFIX}.containers`;
const IMAGES_KEY = `${KEY_PREFIX}.images`;

export class CacheStore {
  constructor(private readonly storage: vscode.Memento) {}

  getSystemInfo(): SystemCache {
    const envelope = this.read<SystemCache>(SYSTEM_KEY);
    return envelope?.data ?? {};
  }

  async setSystemInfo(info: SystemCache): Promise<void> {
    await this.write(SYSTEM_KEY, info);
  }

  getContainers(): ContainerSummary[] {
    const envelope = this.read<ContainerSummary[]>(CONTAINERS_KEY);
    return envelope?.data ? this.clone(envelope.data) : [];
  }

  async setContainers(containers: ContainerSummary[]): Promise<void> {
    await this.write(CONTAINERS_KEY, containers);
  }

  getImages(): ImageSummary[] {
    const envelope = this.read<ImageSummary[]>(IMAGES_KEY);
    return envelope?.data ? this.clone(envelope.data) : [];
  }

  async setImages(images: ImageSummary[]): Promise<void> {
    await this.write(IMAGES_KEY, images);
  }

  private read<T>(key: string): CacheEnvelope<T> | undefined {
    try {
      const value = this.storage.get<CacheEnvelope<T>>(key);
      return value ?? undefined;
    } catch (error) {
      logError(`Failed to read cache for ${key}`, error);
      return undefined;
    }
  }

  private async write<T>(key: string, data: T): Promise<void> {
    try {
      const envelope: CacheEnvelope<T> = {
        data: this.clone(data),
        updatedAt: Date.now()
      };
      await this.storage.update(key, envelope);
      log(`Cache updated for ${key}`);
    } catch (error) {
      logError(`Failed to write cache for ${key}`, error);
    }
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
