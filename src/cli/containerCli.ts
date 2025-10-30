import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';

import { AppleContainerError, ErrorCode, toAppleContainerError } from '../core/errors';
import { log, logCommand, logError } from '../core/logger';

const execFileAsync = promisify(execFile);

export type SystemAction = 'start' | 'stop' | 'restart';

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  ports?: string;
  createdAt?: string;
  os?: string;
  arch?: string;
  address?: string;
  cpus?: string;
  memory?: string;
}

export interface ImageSummary {
  id: string;
  repository: string;
  tag: string;
  size?: string;
  createdAt?: string;
  digest?: string;
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
}

export class ContainerCli {
  constructor(private readonly binary: string = 'container') {}

  async exec(args: string[], options: ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    logCommand(this.binary, args);

    try {
      const { stdout, stderr } = await execFileAsync(this.binary, args, {
        timeout: options.timeout ?? 15000,
        cwd: options.cwd,
        env: process.env
      });

      if (stderr?.trim()) {
        log(`CLI stderr (${args.join(' ')}): ${stderr.trim()}`);
      }

      this.logOutputPreview(`CLI stdout (${args.join(' ')})`, stdout);

      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
      throw this.normalizeError(error, args);
    }
  }

  async version(): Promise<string> {
    const { stdout } = await this.exec(['--version']);
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    if (!match) {
      return 'unknown';
    }
    return match[1];
  }

  async system(action: SystemAction): Promise<string> {
    const { stdout } = await this.exec(['system', action]);
    return stdout;
  }

  async getSystemStatus(): Promise<boolean | undefined> {
    try {
      const { stdout } = await this.exec(['system', 'status']);
      const normalized = stdout.toLowerCase();

      if (/running|started|active/.test(normalized) && !/not running|inactive|stopped/.test(normalized)) {
        log('CLI reported system status: running');
        return true;
      }

      if (/stopped|not running|inactive/.test(normalized) && !/running/.test(normalized)) {
        log('CLI reported system status: stopped');
        return false;
      }

      const match = normalized.match(/status\s*:\s*(\w+)/);
      if (match?.[1]) {
        const state = match[1];
        log(`CLI status field detected: ${state}`);
        if (state === 'running' || state === 'active') {
          return true;
        }
        if (state === 'stopped' || state === 'inactive' || state === 'error') {
          return false;
        }
      }

      log('CLI system status output could not be interpreted');
      return undefined;
    } catch (error) {
      logError('Failed to query system status from CLI', error);
      return undefined;
    }
  }

  async listContainers(): Promise<ContainerSummary[]> {
    const commandVariants: string[][] = [
      ['ls', '-a', '--format', 'json'],
      ['ls', '-a'],
      ['list', '--format', 'json'],
      ['list', '-a'],
      ['list']
    ];

    let lastError: unknown;

    for (const args of commandVariants) {
      try {
        const { stdout } = await this.exec(args);
        if (!stdout.trim()) {
          log('listContainers received empty stdout; returning no containers');
          return [];
        }

        const parsed = this.safeJsonParse<unknown>(stdout);
        const records = this.normalizeJsonRecords(parsed, 'containers');
        if (records) {
          const containers = records.map((item, index) => this.mapContainerRecord(item, index));
          log(`Parsed ${containers.length} containers from JSON output`);
          return containers;
        }

        log('JSON parse failed for container list; attempting table parse');
        const containers = this.parseContainerTable(stdout);
        log(`Parsed ${containers.length} containers from table output`);
        return containers;
      } catch (error) {
        lastError = error;
        logError('listContainers variant failed', error);
        continue;
      }
    }

    if (lastError) {
      logError('Failed to list containers via CLI; using fallback data', lastError);
    }

    return this.mockContainers();
  }

  async listImages(): Promise<ImageSummary[]> {
    const commandVariants: string[][] = [
      ['image', 'ls', '--format', 'json'],
      ['image', 'ls'],
      ['image', 'list', '--format', 'json'],
      ['image', 'list']
    ];

    let lastError: unknown;

    for (const args of commandVariants) {
      try {
        const { stdout } = await this.exec(args);
        if (!stdout.trim()) {
          log('listImages received empty stdout; returning no images');
          return [];
        }

        const parsed = this.safeJsonParse<unknown>(stdout);
        const records = this.normalizeJsonRecords(parsed, 'images');
        if (records) {
          const images = records.map((item, index) => this.mapImageRecord(item, index));
          log(`Parsed ${images.length} images from JSON output`);
          return images;
        }

        log('JSON parse failed for image list; attempting table parse');
        const images = this.parseImageTable(stdout);
        log(`Parsed ${images.length} images from table output`);
        return images;
      } catch (error) {
        lastError = error;
        logError('listImages variant failed', error);
        continue;
      }
    }

    if (lastError) {
      logError('Failed to list images via CLI; using fallback data', lastError);
    }

    return this.mockImages();
  }

  async ensureAvailable(): Promise<void> {
    try {
      await this.version();
    } catch (error) {
      throw toAppleContainerError(error);
    }
  }

  private mockContainers(): ContainerSummary[] {
    const user = os.userInfo().username;
    return [
      {
        id: 'mock-web',
        name: 'web-server',
        image: 'ghcr.io/example/web:latest',
        status: 'running',
        ports: '80/tcp -> 8080',
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      },
      {
        id: 'mock-db',
        name: `db-${user}`,
        image: 'docker.io/library/postgres:15',
        status: 'stopped',
        ports: '5432/tcp',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }
    ];
  }

  private mockImages(): ImageSummary[] {
    return [
      {
        id: 'img-alpine',
        repository: 'alpine',
        tag: 'latest',
        size: '5 MB',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'img-ubuntu',
        repository: 'ubuntu',
        tag: '22.04',
        size: '75 MB',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
  }

  private safeJsonParse<T>(value: string): T | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // fall through to NDJSON parsing
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return undefined;
    }

    const ndjson: unknown[] = [];
    for (const line of lines) {
      try {
        ndjson.push(JSON.parse(line));
      } catch {
        return undefined;
      }
    }

    if (ndjson.length === 0) {
      return undefined;
    }

    return ndjson as T;
  }

  private parseContainerTable(stdout: string): ContainerSummary[] {
    const rows = this.parseTable(stdout);
    if (rows.length === 0) {
      return [];
    }

    return rows.map((row, index) => ({
      id: this.getRowValue(row, ['CONTAINER ID', 'CONTAINERID', 'ID', 'Name', 'NAME', 'NAMES']) ?? `container-${index}`,
      name: this.getRowValue(row, ['NAME', 'NAMES', 'CONTAINER NAME', 'CONTAINERNAME', 'DISPLAY NAME', 'CONTAINER ID', 'ID']) ?? `container-${index}`,
      image: this.getRowValue(row, ['IMAGE', 'IMAGE NAME', 'REPOSITORY', 'REF', 'REFERENCE']) ?? 'unknown',
      status: this.getRowValue(row, ['STATUS', 'STATE']) ?? 'unknown',
      ports: this.getRowValue(row, ['PORTS', 'PORT', 'PORT(S)']),
      createdAt: this.getRowValue(row, ['CREATED', 'CREATED AT', 'CREATEDAT', 'CREATED ON']),
      os: this.getRowValue(row, ['OS', 'OPERATING SYSTEM']),
      arch: this.getRowValue(row, ['ARCH', 'ARCHITECTURE']),
      address: this.getRowValue(row, ['ADDRESS', 'ADDR', 'IP', 'HOST']),
      cpus: this.getRowValue(row, ['CPUS', 'CPU', 'VCPU']),
      memory: this.getRowValue(row, ['MEMORY', 'MEM', 'RAM'])
    }));
  }

  private parseImageTable(stdout: string): ImageSummary[] {
    const rows = this.parseTable(stdout);
    if (rows.length === 0) {
      return [];
    }

    return rows.map((row, index) => ({
      id: this.getRowValue(row, ['IMAGE ID', 'IMAGEID', 'ID']) ?? `image-${index}`,
      repository: this.getRowValue(row, ['REPOSITORY', 'NAME', 'IMAGE', 'REF', 'REFERENCE']) ?? 'unknown',
      tag: this.getRowValue(row, ['TAG', 'TAGS', 'TAG(S)']) ?? 'latest',
      size: this.getRowValue(row, ['SIZE']),
      createdAt: this.getRowValue(row, ['CREATED', 'CREATED AT', 'CREATEDAT', 'CREATED ON']),
      digest: this.getRowValue(row, ['DIGEST', 'DIGESTS', 'IMAGE DIGEST'])
    }));
  }

  private parseTable(stdout: string): Array<Record<string, string>> {
    const ansiRegex = /\u001b\[[0-9;]*m/g;
    const lines = stdout
      .split(/\r?\n/)
      .map(line => line.replace(ansiRegex, '').trimEnd())
      .filter(line => line.length > 0);

    if (lines.length < 2) {
      return [];
    }

    const headerLine = lines[0];
    const separator = this.detectSeparator(headerLine);
    const headers = this.splitTableLine(headerLine, separator);
    log(`Table headers detected: ${headers.join(', ')}`);
    if (headers.length === 0) {
      return [];
    }

    return lines.slice(1).map(line => {
      const values = this.splitTableLine(line, separator);
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        const value = values[index];
        if (value) {
          record[header] = value;
        }
      });
      return this.normalizeRecord(record);
    }).filter(row => Object.keys(row).length > 0);
  }

  private detectSeparator(headerLine: string): RegExp {
    if (headerLine.includes('\t')) {
      return /\t+/;
    }

    if (headerLine.includes('|')) {
      return /\s*\|\s*/;
    }

    return /\s{2,}/;
  }

  private splitTableLine(line: string, separator: RegExp): string[] {
    return line.split(separator).map(segment => segment.trim());
  }

  private normalizeRecord(record: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!value) {
        continue;
      }

      normalized[key] = value;

      const upper = key.toUpperCase();
      const lower = key.toLowerCase();
      const collapsed = key.replace(/\s+/g, '');

      normalized[upper] = value;
      normalized[lower] = value;
      normalized[collapsed] = value;
      normalized[collapsed.toUpperCase()] = value;
      normalized[collapsed.toLowerCase()] = value;
    }

    return normalized;
  }

  private getRowValue(row: Record<string, string>, aliases: string[]): string | undefined {
    for (const alias of aliases) {
      if (alias in row) {
        return row[alias];
      }
    }
    return undefined;
  }

  private normalizeJsonRecords(raw: unknown, arrayProperty?: string): Record<string, unknown>[] | undefined {
    if (Array.isArray(raw)) {
      return raw.map(item => this.asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
    }

    if (arrayProperty && this.isRecord(raw) && Array.isArray(raw[arrayProperty])) {
      return (raw[arrayProperty] as unknown[])
        .map(item => this.asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item));
    }

    return undefined;
  }

  private mapContainerRecord(record: Record<string, unknown>, index: number): ContainerSummary {
    const id = this.firstString(
      record['id'],
      record['ID'],
      record['identifier'],
      record['Identifier'],
      record['containerId'],
      record['containerID'],
      record['uuid'],
      record['UUID']
    ) ?? `container-${index}`;

    const name = this.firstString(
      record['name'],
      record['Name'],
      record['NAMES'],
      record['displayName'],
      record['hostname'],
      this.getNestedString(record, ['metadata', 'name']),
      this.getNestedString(record, ['config', 'hostname']),
      this.extractNetworkHostname(record)
    ) ?? id;

    const status = this.firstString(
      record['status'],
      record['Status'],
      record['state'],
      record['State'],
      this.getNestedString(record, ['lifecycle', 'state']),
      this.getNestedString(record, ['runtime', 'status'])
    ) ?? 'unknown';

    const imageReference = this.firstString(
      record['image'],
      record['Image'],
      record['imageRef'],
      record['imageReference'],
      record['reference']
    ) ?? this.extractImageReference(record);

    const imageDetails = this.parseImageReference(imageReference);
    const ports = this.formatPortBindings(
      record['ports'] ??
      record['Ports'] ??
      record['portBindings'] ??
      record['PortBindings'] ??
      record['exposedPorts'] ??
      record['ExposedPorts'] ??
      this.getNestedValue(record, ['network', 'ports']) ??
      this.getNestedValue(record, ['networkSettings', 'ports'])
    );

    const address = this.firstString(
      record['address'],
      record['addr'],
      record['ADDR'],
      this.extractNetworkAddress(record)
    );

    const createdAt = this.firstString(
      record['createdAt'],
      record['created'],
      record['CreatedAt'],
      record['Created'],
      this.extractCreatedAt(record)
    );

    const cpus = this.firstString(
      record['cpus'],
      record['cpu'],
      record['CPUS'],
      record['CPU'],
      this.getNestedValue(record, ['resources', 'cpus']),
      this.getNestedValue(record, ['resources', 'cpu']),
      this.getNestedValue(record, ['limits', 'cpus']),
      this.getNestedValue(record, ['limits', 'cpu'])
    );

    const memoryRaw = this.firstDefined(
      record['memory'],
      record['Memory'],
      this.getNestedValue(record, ['resources', 'memory']),
      this.getNestedValue(record, ['limits', 'memory'])
    );
    const memory = this.formatMaybeBytes(memoryRaw);

    const os = this.firstString(
      record['os'],
      record['OS'],
      record['operatingSystem'],
      record['OperatingSystem'],
      this.getNestedValue(record, ['platform', 'os']),
      this.getNestedValue(record, ['Platform', 'OS'])
    );

    const arch = this.firstString(
      record['arch'],
      record['ARCH'],
      record['architecture'],
      record['Architecture'],
      this.getNestedValue(record, ['platform', 'architecture']),
      this.getNestedValue(record, ['Platform', 'Architecture'])
    );

    return {
      id,
      name,
      image: imageDetails.full ?? imageReference ?? 'unknown',
      status,
      ports,
      createdAt,
      os,
      arch,
      address,
      cpus,
      memory
    };
  }

  private mapImageRecord(record: Record<string, unknown>, index: number): ImageSummary {
    const descriptor = this.asRecord(record['descriptor']);
    const annotations = this.asRecord(descriptor?.['annotations']);

    const reference = this.firstString(
      record['reference'],
      annotations?.['io.containerd.image.name'],
      annotations?.['com.apple.containerization.image.name']
    );

    const parsedRef = this.parseImageReference(reference, this.firstString(annotations?.['org.opencontainers.image.ref.name']));

    const id = this.firstString(
      record['id'],
      record['ID'],
      descriptor?.['digest']
    ) ?? `image-${index}`;

    const createdAt = this.firstString(
      record['createdAt'],
      record['CreatedAt'],
      annotations?.['org.opencontainers.image.created']
    );

    const sizeRaw = this.firstDefined(
      record['size'],
      record['Size'],
      descriptor?.['size']
    );
    const size = this.formatMaybeBytes(sizeRaw);

    const digest = this.firstString(
      record['digest'],
      record['Digest'],
      descriptor?.['digest']
    );

    return {
      id,
      repository: parsedRef.repository ?? 'unknown',
      tag: parsedRef.tag ?? 'latest',
      size,
      createdAt,
      digest
    };
  }

  private formatMaybeBytes(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'number') {
      return this.formatBytes(value);
    }

    if (typeof value === 'string') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return this.formatBytes(numeric);
      }
      return value;
    }

    return String(value);
  }

  private formatBytes(bytes: number): string {
    const absolute = Math.abs(bytes);
    if (absolute < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let size = absolute;
    let unitIndex = -1;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const formatted = size >= 10 ? size.toFixed(0) : size.toFixed(1);
    const sign = bytes < 0 ? '-' : '';
    return `${sign}${formatted} ${units[unitIndex]}`;
  }

  private extractCreatedAt(record: Record<string, unknown>): string | undefined {
    const image = this.asRecord(record['image']) ?? this.asRecord(record['Image']);
    const descriptor = this.asRecord(image?.['descriptor']);
    const annotations = this.asRecord(descriptor?.['annotations']);
    return this.firstString(
      annotations?.['org.opencontainers.image.created'],
      annotations?.['com.apple.containerization.created']
    );
  }

  private extractImageReference(record: Record<string, unknown>): string | undefined {
    const image = this.asRecord(record['image']) ?? this.asRecord(record['Image']);
    if (!image) {
      return undefined;
    }

    const reference = this.firstString(
      image['reference'],
      image['ref'],
      image['name'],
      image['image'],
      image['RepoTags']
    );
    if (reference) {
      return reference;
    }

    const descriptor = this.asRecord(image['descriptor']);
    const annotations = this.asRecord(descriptor?.['annotations']);
    const annotatedName = this.firstString(
      annotations?.['io.containerd.image.name'],
      annotations?.['com.apple.containerization.image.name']
    );
    const annotatedTag = this.firstString(annotations?.['org.opencontainers.image.ref.name']);

    if (annotatedName && annotatedTag) {
      return `${annotatedName}:${annotatedTag}`;
    }

    return annotatedName ?? this.firstString(descriptor?.['digest']);
  }

  private extractNetworkHostname(record: Record<string, unknown>): string | undefined {
    const networks = this.asArray(record['networks']) ?? this.asArray(record['Networks']);
    if (!networks) {
      return undefined;
    }

    for (const entry of networks) {
      if (!this.isRecord(entry)) {
        continue;
      }

      const hostname = this.firstString(entry['hostname'], entry['Hostname']);
      if (hostname) {
        return hostname;
      }

      const options = this.asRecord(entry['options']);
      const optionHostname = this.firstString(options?.['hostname'], options?.['Hostname']);
      if (optionHostname) {
        return optionHostname;
      }
    }

    return undefined;
  }

  private extractNetworkAddress(record: Record<string, unknown>): string | undefined {
    const networks = this.asArray(record['networks']) ?? this.asArray(record['Networks']);
    if (!networks) {
      return undefined;
    }

    const addresses: string[] = [];
    for (const entry of networks) {
      if (!this.isRecord(entry)) {
        continue;
      }

      const networkName = this.firstString(entry['network'], entry['name'], entry['id']);
      const address = this.firstString(entry['address'], entry['ip'], entry['ipAddress'], entry['IPAddress']);
      const gateway = this.firstString(entry['gateway'], entry['Gateway']);

      const parts: string[] = [];
      if (networkName) {
        parts.push(networkName);
      }
      if (address) {
        parts.push(address);
      }
      if (gateway) {
        parts.push(`gw=${gateway}`);
      }
      if (parts.length > 0) {
        addresses.push(parts.join(' '));
      }
    }

    return addresses.length > 0 ? addresses.join(', ') : undefined;
  }

  private parseImageReference(reference?: string, tagHint?: string): { repository?: string; tag?: string; full?: string } {
    if (!reference) {
      if (tagHint) {
        return { tag: tagHint };
      }
      return {};
    }

    const trimmed = reference.trim();
    if (!trimmed) {
      return {};
    }

    const lastColon = trimmed.lastIndexOf(':');
    if (lastColon > trimmed.lastIndexOf('/')) {
      const repository = trimmed.slice(0, lastColon) || undefined;
      const tag = trimmed.slice(lastColon + 1) || tagHint || 'latest';
      return { repository: repository ?? undefined, tag, full: trimmed };
    }

    return {
      repository: trimmed,
      tag: tagHint ?? 'latest',
      full: tagHint ? `${trimmed}:${tagHint}` : trimmed
    };
  }

  private formatPortBindings(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    const entries: string[] = [];

    if (this.isRecord(value)) {
      for (const [containerKey, bindingValue] of Object.entries(value)) {
        const bindingArray = this.asArray(bindingValue) ?? [bindingValue];
        for (const binding of bindingArray) {
          if (!this.isRecord(binding)) {
            continue;
          }
          const hostPort = this.firstString(binding['hostPort'], binding['HostPort']);
          const hostAddress = this.firstString(binding['hostAddress'], binding['HostAddress'], binding['hostIp'], binding['HostIp']);
          const proto = this.firstString(binding['proto'], binding['Proto'], binding['protocol'], binding['Protocol']);
          entries.push(this.composePortEntry(containerKey, hostAddress, hostPort, proto));
        }
      }
    }

    const arrayBindings = this.asArray(value);
    if (arrayBindings) {
      for (const binding of arrayBindings) {
        if (!this.isRecord(binding)) {
          continue;
        }
        const containerPort = this.firstString(binding['containerPort'], binding['ContainerPort'], binding['port'], binding['Port']);
        const hostPort = this.firstString(binding['hostPort'], binding['HostPort']);
        const hostAddress = this.firstString(binding['hostAddress'], binding['HostAddress'], binding['hostIp'], binding['HostIp']);
        const proto = this.firstString(binding['proto'], binding['Proto'], binding['protocol'], binding['Protocol']);
        entries.push(this.composePortEntry(containerPort, hostAddress, hostPort, proto));
      }
    }

    const filtered = entries.filter(entry => entry.length > 0);
    return filtered.length > 0 ? Array.from(new Set(filtered)).join(', ') : undefined;
  }

  private composePortEntry(
    containerPort: string | undefined,
    hostAddress: string | undefined,
    hostPort: string | undefined,
    proto: string | undefined
  ): string {
    const pieces: string[] = [];
    if (hostAddress && hostAddress !== '0.0.0.0') {
      pieces.push(`${hostAddress}:`);
    }
    if (hostPort) {
      pieces.push(hostPort);
    }

    if (containerPort) {
      if (pieces.length > 0) {
        pieces.push('->');
      }
      pieces.push(containerPort);
    }

    if (proto && !(containerPort && containerPort.includes('/'))) {
      pieces.push(`/${proto}`);
    }

    const entry = pieces.join('');
    return entry.length > 0 ? entry : (containerPort ?? '');
  }

  private firstDefined<T>(...values: (T | undefined)[]): T | undefined {
    for (const value of values) {
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
        continue;
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return undefined;
  }

  private getNestedValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const segment of path) {
      if (!this.isRecord(current)) {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  private getNestedString(source: unknown, path: string[]): string | undefined {
    return this.firstString(this.getNestedValue(source, path));
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (this.isRecord(value)) {
      return value;
    }
    return undefined;
  }

  private asArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private logOutputPreview(label: string, output: string): void {
    const trimmed = output.trim();
    if (!trimmed) {
      log(`${label}: <empty>`);
      return;
    }

    const lines = trimmed.split(/\r?\n/);
    const previewLines = lines.slice(0, 10);
    log(`${label} — ${lines.length} line(s), ${trimmed.length} char(s)`);
    for (const line of previewLines) {
      log(`${label} :: ${line}`);
    }
    if (lines.length > previewLines.length) {
      log(`${label} :: ... (${lines.length - previewLines.length} more lines)`);
    }
  }

  private normalizeError(error: unknown, args: string[]): AppleContainerError {
    const err = error as NodeJS.ErrnoException & { stderr?: string };

    if (err?.code === 'ENOENT') {
      return new AppleContainerError('container CLI not found on PATH', ErrorCode.CliNotFound, error);
    }

    if (err?.code === 'EACCES') {
      return new AppleContainerError('Permission denied while executing container CLI', ErrorCode.PermissionDenied, error);
    }

    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : undefined;
    const message = stderr && stderr.length > 0 ? stderr : err?.message ?? 'Unknown CLI error';
    logError(`CLI command failed: ${args.join(' ')}`, error);
    return new AppleContainerError(message, ErrorCode.CommandFailed, error);
  }
}
