import * as vscode from 'vscode';

import { ContainerCreateOptions, ImageSummary, VolumeMapping } from '../cli/containerCli';

type BasicField = 'image' | 'name' | 'arch' | 'cpus' | 'memory';
type AdvancedField = 'ports' | 'volumes' | 'additional';

interface WizardState {
  image?: string;
  name?: string;
  arch: string;
  cpus: number;
  memory: string;
  ports: string[];
  volumes: VolumeMapping[];
  additionalArgs: string[];
}

interface ImagePickItem extends vscode.QuickPickItem {
  variant: 'image' | 'custom';
  value?: string;
}

interface VolumePickItem extends vscode.QuickPickItem {
  variant: 'add' | 'remove';
  index?: number;
}

interface BasicPickItem extends vscode.QuickPickItem {
  key: BasicField | 'next';
}

interface AdvancedPickItem extends vscode.QuickPickItem {
  key: AdvancedField | 'done' | 'back';
}

export class ContainerCreateWizard {
  constructor(
    private readonly images: ImageSummary[],
    private readonly workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ) {}

  async run(): Promise<ContainerCreateOptions | undefined> {
    const state: WizardState = {
      arch: 'arm64',
      cpus: 1,
      memory: '1024M',
      ports: [],
      volumes: [],
      additionalArgs: []
    };

    let revisitBasics = true;

    while (revisitBasics) {
      const proceed = await this.collectBasicSettings(state);
      if (!proceed) {
        return undefined;
      }

      const advancedOutcome = await this.collectAdvancedSettings(state);
      if (advancedOutcome === 'cancel') {
        return undefined;
      }
      if (advancedOutcome === 'back') {
        continue;
      }

      if (!state.image) {
        return undefined;
      }

      const result: ContainerCreateOptions = {
        image: state.image,
        name: state.name,
        arch: state.arch,
        cpus: state.cpus,
        memory: state.memory,
        ports: [...state.ports],
        volumes: state.volumes.map(volume => ({ ...volume })),
        additionalArgs: [...state.additionalArgs]
      };

      revisitBasics = false;
      return result;
    }

    return undefined;
  }

  private async collectBasicSettings(state: WizardState): Promise<boolean> {
    const selection = await vscode.window.showQuickPick<BasicPickItem>(
      this.buildBasicPickItems(state),
      {
        placeHolder: 'Create Container (1/2): configure image, name, and resources (Esc to cancel)',
        ignoreFocusOut: true,
        matchOnDetail: true
      }
    );

    if (!selection) {
      return false;
    }

    if (selection.key === 'next') {
      if (!state.image || !state.name) {
        void vscode.window.showWarningMessage('Select an image and enter a container name first.');
        return this.collectBasicSettings(state);
      }
      return true;
    }

    await this.handleBasicSelection(selection.key, state);
    return this.collectBasicSettings(state);
  }

  private async collectAdvancedSettings(state: WizardState): Promise<'done' | 'back' | 'cancel'> {
    const selection = await vscode.window.showQuickPick<AdvancedPickItem>(
      this.buildAdvancedPickItems(state),
      {
        placeHolder: 'Create Container (2/2): configure ports, volumes, and other options (Esc to cancel)',
        ignoreFocusOut: true,
        matchOnDetail: true
      }
    );

    if (!selection) {
      return 'cancel';
    }

    if (selection.key === 'back' || selection.key === 'done') {
      return selection.key;
    }

    await this.handleAdvancedSelection(selection.key, state);
    return this.collectAdvancedSettings(state);
  }

  private buildBasicPickItems(state: WizardState): BasicPickItem[] {
    const items: BasicPickItem[] = [
      {
        key: 'image',
        label: 'Image',
        description: state.image ?? 'Select or enter an image name'
      },
      {
        key: 'name',
        label: 'Container name',
        description: state.name ?? 'Enter a container name'
      },
      {
        key: 'arch',
        label: 'CPU architecture',
        description: state.arch
      },
      {
        key: 'cpus',
        label: 'CPU cores',
        description: `${state.cpus}`
      },
      {
        key: 'memory',
        label: 'Memory limit',
        description: state.memory
      }
    ];

    items.push({
      key: 'next',
      label: 'Next →',
      description: state.image && state.name ? 'Continue to configure ports, volumes, and advanced options' : 'Image and container name are required first',
      detail: state.image && state.name ? undefined : 'Your current entries are kept; complete the missing fields to continue',
      alwaysShow: true
    });

    return items;
  }

  private buildAdvancedPickItems(state: WizardState): AdvancedPickItem[] {
    return [
      {
        key: 'ports',
        label: 'Port mappings',
        description: state.ports.length > 0 ? state.ports.join(', ') : 'Not set'
      },
      {
        key: 'volumes',
        label: 'Filesystem mappings',
        description: state.volumes.length > 0
          ? state.volumes.map(volume => `${volume.source} → ${volume.target}${volume.readOnly ? ' (read-only)' : ''}`).join(', ')
          : 'Not set'
      },
      {
        key: 'additional',
        label: 'Additional arguments',
        description: state.additionalArgs.length > 0 ? state.additionalArgs.join(' ') : 'Not set'
      },
      {
        key: 'back',
        label: '← Back to basic settings',
        description: 'Adjust image or resource settings',
        alwaysShow: true
      },
      {
        key: 'done',
        label: 'Create container',
        description: 'Run container with current configuration',
        alwaysShow: true
      }
    ];
  }

  private async handleBasicSelection(field: BasicField, state: WizardState): Promise<void> {
    switch (field) {
      case 'image': {
        const selection = await this.pickImage(state.image);
        if (!selection) {
          return;
        }
        state.image = selection;
        if (!state.name) {
          state.name = this.deriveNameFromImage(selection);
        }
        break;
      }
      case 'name': {
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a container name',
          placeHolder: 'Example: web-service',
          value: state.name ?? '',
          validateInput: input => {
            if (!input?.trim()) {
              return 'Container name cannot be empty';
            }
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(input.trim())) {
              return 'Container name may include letters, numbers, . _ -, and must start with an alphanumeric character';
            }
            return undefined;
          },
          ignoreFocusOut: true
        });
        if (value?.trim()) {
          state.name = value.trim();
        }
        break;
      }
      case 'arch': {
        const arch = await vscode.window.showQuickPick(
          [
            { label: 'arm64', description: 'Default architecture', value: 'arm64' },
            { label: 'amd64', description: 'x86 architecture', value: 'amd64' },
            { label: 'x86_64', description: 'Intel compatible', value: 'x86_64' },
            { label: 'Custom…', value: 'custom' }
          ],
          {
            placeHolder: 'Select a CPU architecture',
            ignoreFocusOut: true
          }
        );
        if (!arch) {
          return;
        }
        if (arch.value === 'custom') {
          const custom = await vscode.window.showInputBox({
            prompt: 'Enter an architecture identifier',
            placeHolder: 'Example: riscv64',
            value: state.arch,
            ignoreFocusOut: true,
            validateInput: input => (!input?.trim() ? 'Architecture cannot be empty' : undefined)
          });
          if (custom?.trim()) {
            state.arch = custom.trim();
          }
        } else if (arch.value) {
          state.arch = arch.value;
        }
        break;
      }
      case 'cpus': {
        const cpuSelection = await vscode.window.showQuickPick(
          [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
            { label: 'Custom…', value: -1 }
          ],
          {
            placeHolder: 'Select CPU cores',
            ignoreFocusOut: true
          }
        );
        if (!cpuSelection) {
          return;
        }
        if (cpuSelection.value === -1) {
          const customCpu = await vscode.window.showInputBox({
            prompt: 'Enter CPU core count',
            validateInput: input => {
              const value = Number.parseInt(input, 10);
              if (Number.isNaN(value) || value <= 0) {
                return 'Enter an integer greater than 0';
              }
              return undefined;
            },
            value: state.cpus.toString(),
            ignoreFocusOut: true
          });
          if (customCpu) {
            state.cpus = Number.parseInt(customCpu, 10);
          }
        } else {
          state.cpus = cpuSelection.value;
        }
        break;
      }
      case 'memory': {
        const memory = await vscode.window.showInputBox({
          prompt: 'Enter a memory limit',
          placeHolder: '1024M, 2G, 512K, etc.',
          value: state.memory,
          ignoreFocusOut: true,
          validateInput: input => {
            if (!input?.trim()) {
              return 'Memory limit cannot be empty';
            }
            const normalized = input.trim();
            return /^[0-9]+(?:\.[0-9]+)?[KMGTP]?$/i.test(normalized) ? undefined : 'Enter a valid memory value (e.g., 1024M)';
          }
        });
        if (memory?.trim()) {
          state.memory = this.normalizeMemory(memory.trim());
        }
        break;
      }
      default:
        break;
    }
  }

  private async handleAdvancedSelection(field: AdvancedField, state: WizardState): Promise<void> {
    switch (field) {
      case 'ports': {
        const value = await vscode.window.showInputBox({
          prompt: 'Configure port mappings',
          placeHolder: 'Format: hostPort:containerPort[/protocol], comma-separated for multiple entries',
          value: state.ports.join(', '),
          ignoreFocusOut: true,
          validateInput: input => {
            if (!input?.trim()) {
              return undefined;
            }
            const entries = input.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0);
            for (const entry of entries) {
              if (!/^[0-9]+(?::[0-9]+)?(?:\/(tcp|udp))?$/i.test(entry) && !/^[^:]+:[0-9]+:[0-9]+(?:\/(tcp|udp))?$/i.test(entry)) {
                return `Invalid port mapping: ${entry}`;
              }
            }
            return undefined;
          }
        });
        if (value === undefined) {
          return;
        }
        const ports = value
          .split(',')
          .map(entry => entry.trim())
          .filter(entry => entry.length > 0);
        state.ports = ports;
        break;
      }
      case 'volumes': {
        await this.manageVolumes(state);
        break;
      }
      case 'additional': {
        const value = await vscode.window.showInputBox({
          prompt: 'Enter additional CLI arguments',
          placeHolder: '--env KEY=VALUE --rm, etc. separated by spaces',
          value: state.additionalArgs.join(' '),
          ignoreFocusOut: true
        });
        if (value === undefined) {
          return;
        }
        state.additionalArgs = this.parseArguments(value);
        break;
      }
      default:
        break;
    }
  }

  private async pickImage(current?: string): Promise<string | undefined> {
    const items: ImagePickItem[] = this.images.map(image => {
      const reference = [image.repository, image.tag].filter(Boolean).join(':') || image.id;
      const detailParts = [
        image.size ? `Size ${image.size}` : undefined,
        image.createdAt ? `Created ${image.createdAt}` : undefined
      ].filter(Boolean);
      return {
        variant: 'image',
        value: reference,
        label: reference,
        description: image.repository && image.tag ? undefined : image.id,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
        picked: reference === current
      };
    });

    items.unshift({
      variant: 'custom',
      label: 'Custom image…',
      description: 'Enter image name manually',
      alwaysShow: true
    });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'Pick an existing image or enter a custom image',
      ignoreFocusOut: true
    });

    if (!selection) {
      return undefined;
    }

    if (selection.variant === 'custom') {
      const custom = await vscode.window.showInputBox({
        prompt: 'Enter an image name',
        placeHolder: 'Example: ghcr.io/org/app:latest',
        value: current ?? '',
        ignoreFocusOut: true,
        validateInput: input => (!input?.trim() ? 'Image name cannot be empty' : undefined)
      });
      return custom?.trim() ? custom.trim() : undefined;
    }

    return selection.value;
  }

  private async manageVolumes(state: WizardState): Promise<void> {
    let managing = true;
    while (managing) {
      const items: VolumePickItem[] = [
        {
          variant: 'add',
          label: 'Add mapping…',
          description: 'Pick a local folder and specify the container path'
        },
        ...state.volumes.map((volume, index) => ({
          variant: 'remove' as const,
          index,
          label: `${volume.source} → ${volume.target}`,
          description: volume.readOnly ? 'Read-only mapping, click to remove' : 'Click to remove'
        }))
      ];

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Manage filesystem mappings',
        ignoreFocusOut: true
      });

      if (!selection) {
        managing = false;
        continue;
      }

      if (selection.variant === 'add') {
        const source = await this.pickLocalFolder();
        if (!source) {
          continue;
        }
        const target = await vscode.window.showInputBox({
          prompt: 'Container path',
          placeHolder: '/app/data',
          ignoreFocusOut: true,
          validateInput: input => (!input?.trim() ? 'Target path cannot be empty' : undefined)
        });
        if (!target?.trim()) {
          continue;
        }
        const readOnlyChoice = await vscode.window.showQuickPick(
          [
            { label: 'Read/write', value: false },
            { label: 'Read-only', value: true }
          ],
          {
            placeHolder: 'Select access mode',
            ignoreFocusOut: true
          }
        );
        const mapping: VolumeMapping = {
          source,
          target: target.trim(),
          readOnly: readOnlyChoice?.value ?? false
        };
        state.volumes = [...state.volumes, mapping];
        continue;
      }

      if (selection.variant === 'remove' && selection.index !== undefined) {
        const removed = state.volumes[selection.index];
        const confirm = await vscode.window.showQuickPick(
          [
            { label: 'Remove mapping', description: `${removed.source} → ${removed.target}`, value: true },
            { label: 'Keep', value: false }
          ],
          {
            placeHolder: 'Remove this mapping?',
            ignoreFocusOut: true
          }
        );
        if (confirm?.value) {
          state.volumes = state.volumes.filter((_, idx) => idx !== selection.index);
        }
      }
    }
  }

  private async pickLocalFolder(): Promise<string | undefined> {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select folder',
      defaultUri: this.workspaceFolders?.[0]?.uri
    });
    if (!uri || uri.length === 0) {
      return undefined;
    }
    return uri[0].fsPath;
  }

  private parseArguments(value: string): string[] {
    if (!value?.trim()) {
      return [];
    }
    const tokens = value.match(/"([^"]*)"|'([^']*)'|[^\s]+/g);
    if (!tokens) {
      return [];
    }
    return tokens.map(token => token.replace(/^['"]|['"]$/g, ''));
  }

  private normalizeMemory(value: string): string {
    const upper = value.toUpperCase();
    if (/^[0-9]+$/.test(upper)) {
      return `${upper}M`;
    }
    return upper;
  }

  private deriveNameFromImage(image: string): string {
    const sanitized = image.replace(/[:/]+/g, '-');
    if (sanitized.length === 0) {
      return 'container';
    }
    const trimmed = sanitized.replace(/[^a-zA-Z0-9_.-]/g, '-');
    return trimmed.length > 0 ? trimmed : 'container';
  }
}
