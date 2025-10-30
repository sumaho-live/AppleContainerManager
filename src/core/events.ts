import { EventEmitter } from 'node:events';

import { AppleContainerError } from './errors';
import { ContainerSummary, ImageSummary } from '../cli/containerCli';

export interface SystemStatusPayload {
  running: boolean;
  localVersion?: string;
  latestVersion?: string;
  latestUrl?: string;
  updateAvailable?: boolean;
}

export type AppEventMap = {
  'system:status': SystemStatusPayload;
  'data:containers': ContainerSummary[];
  'data:images': ImageSummary[];
  error: AppleContainerError;
};

class TypedEventEmitter<TEvents extends Record<string, unknown>> {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof TEvents & string>(eventName: K, payload: TEvents[K]): boolean {
    return this.emitter.emit(eventName, payload);
  }

  on<K extends keyof TEvents & string>(eventName: K, listener: (payload: TEvents[K]) => void): this {
    this.emitter.on(eventName, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof TEvents & string>(eventName: K, listener: (payload: TEvents[K]) => void): this {
    this.emitter.off(eventName, listener as (...args: unknown[]) => void);
    return this;
  }
}

export const events = new TypedEventEmitter<AppEventMap>();
