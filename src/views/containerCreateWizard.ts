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
        placeHolder: '创建容器 (1/2)：配置镜像、名称与资源 (Esc 取消)',
        ignoreFocusOut: true,
        matchOnDetail: true
      }
    );

    if (!selection) {
      return false;
    }

    if (selection.key === 'next') {
      if (!state.image || !state.name) {
        void vscode.window.showWarningMessage('请先选择镜像并填写容器名称。');
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
        placeHolder: '创建容器 (2/2)：配置端口、卷与其他参数 (Esc 取消)',
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
        label: '镜像',
        description: state.image ?? '点击选择或输入镜像名称'
      },
      {
        key: 'name',
        label: '容器名称',
        description: state.name ?? '点击输入容器名称'
      },
      {
        key: 'arch',
        label: 'CPU 架构',
        description: state.arch
      },
      {
        key: 'cpus',
        label: 'CPU 核数',
        description: `${state.cpus}`
      },
      {
        key: 'memory',
        label: '内存限制',
        description: state.memory
      }
    ];

    items.push({
      key: 'next',
      label: '下一步 →',
      description: state.image && state.name ? '继续配置端口、卷等高级选项' : '需要先填写镜像与容器名称',
      detail: state.image && state.name ? undefined : '已填写项会保留，可继续补充后再进行下一步',
      alwaysShow: true
    });

    return items;
  }

  private buildAdvancedPickItems(state: WizardState): AdvancedPickItem[] {
    return [
      {
        key: 'ports',
        label: '端口映射',
        description: state.ports.length > 0 ? state.ports.join(', ') : '未设置'
      },
      {
        key: 'volumes',
        label: '文件系统映射',
        description: state.volumes.length > 0
          ? state.volumes.map(volume => `${volume.source} → ${volume.target}${volume.readOnly ? ' (只读)' : ''}`).join(', ')
          : '未设置'
      },
      {
        key: 'additional',
        label: '其他参数',
        description: state.additionalArgs.length > 0 ? state.additionalArgs.join(' ') : '未设置'
      },
      {
        key: 'back',
        label: '← 返回基础配置',
        description: '调整镜像或资源设置',
        alwaysShow: true
      },
      {
        key: 'done',
        label: '完成并创建容器',
        description: '使用当前配置运行容器',
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
          prompt: '输入容器名称',
          placeHolder: '例如: web-service',
          value: state.name ?? '',
          validateInput: input => {
            if (!input?.trim()) {
              return '容器名称不能为空';
            }
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(input.trim())) {
              return '容器名称仅支持字母、数字、._-，且不能以符号开头';
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
            { label: 'arm64', description: '默认架构', value: 'arm64' },
            { label: 'amd64', description: 'x86 架构', value: 'amd64' },
            { label: 'x86_64', description: 'Intel 兼容', value: 'x86_64' },
            { label: '自定义…', value: 'custom' }
          ],
          {
            placeHolder: '选择 CPU 架构',
            ignoreFocusOut: true
          }
        );
        if (!arch) {
          return;
        }
        if (arch.value === 'custom') {
          const custom = await vscode.window.showInputBox({
            prompt: '输入架构标识',
            placeHolder: '例如: riscv64',
            value: state.arch,
            ignoreFocusOut: true,
            validateInput: input => (!input?.trim() ? '架构不能为空' : undefined)
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
            { label: '自定义…', value: -1 }
          ],
          {
            placeHolder: '选择 CPU 核数',
            ignoreFocusOut: true
          }
        );
        if (!cpuSelection) {
          return;
        }
        if (cpuSelection.value === -1) {
          const customCpu = await vscode.window.showInputBox({
            prompt: '输入 CPU 核数',
            validateInput: input => {
              const value = Number.parseInt(input, 10);
              if (Number.isNaN(value) || value <= 0) {
                return '请输入大于 0 的整数';
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
          prompt: '输入内存限制',
          placeHolder: '1024M, 2G, 512K 等',
          value: state.memory,
          ignoreFocusOut: true,
          validateInput: input => {
            if (!input?.trim()) {
              return '内存限制不能为空';
            }
            const normalized = input.trim();
            return /^[0-9]+(?:\.[0-9]+)?[KMGTP]?$/i.test(normalized) ? undefined : '请输入有效的内存值 (例如 1024M)';
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
          prompt: '配置端口映射',
          placeHolder: '格式: hostPort:containerPort[/protocol]，多个以逗号分隔',
          value: state.ports.join(', '),
          ignoreFocusOut: true,
          validateInput: input => {
            if (!input?.trim()) {
              return undefined;
            }
            const entries = input.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0);
            for (const entry of entries) {
              if (!/^[0-9]+(?::[0-9]+)?(?:\/(tcp|udp))?$/i.test(entry) && !/^[^:]+:[0-9]+:[0-9]+(?:\/(tcp|udp))?$/i.test(entry)) {
                return `无效端口映射: ${entry}`;
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
          prompt: '输入其他命令行参数',
          placeHolder: '--env KEY=VALUE --rm 等，可用空格分隔',
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
        image.size ? `大小 ${image.size}` : undefined,
        image.createdAt ? `创建于 ${image.createdAt}` : undefined
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
      label: '自定义镜像…',
      description: '手动输入镜像名称',
      alwaysShow: true
    });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: '选择已有镜像或输入自定义镜像',
      ignoreFocusOut: true
    });

    if (!selection) {
      return undefined;
    }

    if (selection.variant === 'custom') {
      const custom = await vscode.window.showInputBox({
        prompt: '输入镜像名称',
        placeHolder: '例如: ghcr.io/org/app:latest',
        value: current ?? '',
        ignoreFocusOut: true,
        validateInput: input => (!input?.trim() ? '镜像名称不能为空' : undefined)
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
          label: '添加映射…',
          description: '选择本地文件夹并指定容器路径'
        },
        ...state.volumes.map((volume, index) => ({
          variant: 'remove' as const,
          index,
          label: `${volume.source} → ${volume.target}`,
          description: volume.readOnly ? '只读映射，点击删除' : '点击删除'
        }))
      ];

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: '管理文件系统映射',
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
          prompt: '容器内目标路径',
          placeHolder: '/app/data',
          ignoreFocusOut: true,
          validateInput: input => (!input?.trim() ? '目标路径不能为空' : undefined)
        });
        if (!target?.trim()) {
          continue;
        }
        const readOnlyChoice = await vscode.window.showQuickPick(
          [
            { label: '读写', value: false },
            { label: '只读', value: true }
          ],
          {
            placeHolder: '选择权限',
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
            { label: '删除映射', description: `${removed.source} → ${removed.target}`, value: true },
            { label: '保留', value: false }
          ],
          {
            placeHolder: '确认删除该映射？',
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
      openLabel: '选择文件夹',
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
