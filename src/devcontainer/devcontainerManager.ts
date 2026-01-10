import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import { ContainerCli, ContainerCreateOptions, ContainerExecOptions } from '../cli/containerCli';
import { AppleContainerError, ErrorCode, toAppleContainerError } from '../core/errors';
import { SshManager } from './sshManager';
import { log, logError, logInfo, logWarn } from '../core/logger';

type DevcontainerCommand = string | string[];

interface DevcontainerBuildConfig {
  dockerfile?: string;
  context?: string;
  args?: Record<string, string>;
  labels?: Record<string, string>;
  target?: string;
  options?: string[];
  noCache?: boolean;
  platform?: string;
  arch?: string;
  os?: string;
  cpus?: number | string;
  memory?: string;
  progress?: 'auto' | 'plain' | 'tty';
  quiet?: boolean;
  image?: string | string[];
  additionalImageTags?: string[];
}

interface DevcontainerConfig {
  name?: string;
  image?: string;
  remoteUser?: string;
  workspaceFolder?: string;
  runArgs?: string[];
  containerEnv?: Record<string, string>;
  mounts?: string[];
  forwardPorts?: Array<number | string>;
  postCreateCommand?: DevcontainerCommand;
  postStartCommand?: DevcontainerCommand;
  build?: DevcontainerBuildConfig;
}

interface LoadedConfig {
  config: DevcontainerConfig;
  path: string;
}

interface ResolvedBuildConfig {
  context: string;
  dockerfile?: string;
  args: Record<string, string>;
  labels: Record<string, string>;
  target?: string;
  noCache?: boolean;
  platform?: string;
  arch?: string;
  os?: string;
  cpus?: number;
  memory?: string;
  progress?: 'auto' | 'plain' | 'tty';
  quiet?: boolean;
  additionalOptions: string[];
  tags: string[];
}

interface ResolvedConfig {
  name: string;
  image: string;
  remoteUser?: string;
  workspaceFolder: string;
  workspacePath: string;
  ports: string[];
  volumes: {
    source: string;
    target: string;
    readOnly?: boolean;
  }[];
  cpus?: number;
  memory?: string;
  additionalArgs: string[];
  containerEnv: Record<string, string>;
  postCreateCommand?: DevcontainerCommand;
  postStartCommand?: DevcontainerCommand;
  build?: ResolvedBuildConfig;
}

interface RunArgsParseResult {
  cpus?: number;
  memory?: string;
  user?: string;
  workdir?: string;
  additional: string[];
}

interface VariableContext {
  workspaceFolder: string;
  workspaceBasename: string;
  containerWorkspaceFolder: string;
  env: NodeJS.ProcessEnv;
}

export class DevcontainerManager implements vscode.Disposable {
  private readonly appliedState = new Map<string, ResolvedConfig>();

  constructor(
    private readonly cli: ContainerCli
  ) { }

  dispose(): void {
    this.appliedState.clear();
  }

  async applyDevcontainer(options: { rebuild?: boolean } = {}): Promise<void> {
    const folder = await this.pickWorkspaceFolder();
    if (!folder) {
      return;
    }

    const workspacePath = folder.uri.fsPath;
    const loaded = await this.loadConfig(workspacePath);
    if (!loaded) {
      void vscode.window.showWarningMessage('No devcontainer configuration found in this workspace.');
      return;
    }

    const resolved = this.resolveConfig(loaded.config, workspacePath);
    const containerName = resolved.name;
    logInfo(`Applying devcontainer configuration ${path.relative(workspacePath, loaded.path)}`);

    if (resolved.build) {
      await this.executeImageBuild(resolved);
    }

    const existing = await this.findContainerByName(containerName);
    if (existing) {
      if (!options.rebuild) {
        logInfo(`Reuse existing container ${containerName} (${existing.id}).`);
        // Ensure it is running
        // Ensure it is running
        await this.cli.startContainer(existing.id);
        await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for container to stabilize

        // We still need to ensure SSH keys and config are up to date
        const sshManager = new SshManager();
        const sshKey = await sshManager.ensureSshKey();

        // Inject key again (idempotent-ish) to be safe
        await this.injectSshKey(existing.id, sshKey, resolved.remoteUser);

        // Update config
        const sshPort = this.detectForwardedPort(resolved.ports, 22) ?? '2222';
        await sshManager.updateConfig(containerName, sshPort, resolved.remoteUser);

        await this.runPostCommands(existing.id, resolved, {
          runCreate: false,
          runStart: Boolean(resolved.postStartCommand)
        });

        void vscode.window.showInformationMessage(`Devcontainer ${containerName} is ready (reused).`);
        return;
      }

      logInfo(`Existing container ${containerName} detected (${existing.id}); preparing to rebuild.`);
      await this.stopContainerIfRunning(existing.id, containerName);
      await this.stopContainerIfRunning(existing.id, containerName);
      await this.removeContainer(existing.id, containerName);
      await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for cleanup
    }

    const sshManager = new SshManager();
    const sshKey = await sshManager.ensureSshKey();

    const createOptions = this.toCreateOptions(resolved);

    // Inject SSH setup payload into postCreateCommand or minimal init
    // For now we append a command to inject the key if not present

    // We prepend this to the postCreateCommand or user command to ensure it runs early
    // However, since we run post commands *after* creation via exec, we can just run it as the very first post-command step.

    try {
      await this.cli.createContainer(createOptions);
      await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for creation to complete
      logInfo(`Container ${containerName} created from devcontainer configuration.`);
    } catch (error) {
      const err = toAppleContainerError(error);
      if (err.message.includes('exists')) {
        logWarn(`Container ${containerName} name collision detected. Stale/Zombie container likely exists. Removing and recreating to ensure fresh config.`);
        try {
          // Force remove the conflicting container name/id
          // Force remove the conflicting container name/id
          await this.removeContainer(containerName, containerName);
          await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for removal
        } catch (rmError) {
          logWarn(`Attempt to remove conflicting container ${containerName} failed: ${rmError}`);
          // Proceed to try creation again anyway, though it might fail again if not removed
        }
        // Retry creation
        // Retry creation
        await this.cli.createContainer(createOptions);
        await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for creation to complete
        logInfo(`Container ${containerName} recreated successfully.`);
      } else {
        throw err;
      }
    }

    const created = await this.waitForContainer(containerName, 5_000);
    if (!created) {
      logWarn(`Container ${containerName} not visible after creation; post commands will be skipped.`);
      return;
    }

    // Ensure container is running before attempting to inject keys or run commands
    // If it was just created, it might be stopped (depending on create options, usually create is just create not run?).
    // Actually create usually implies run in some CLIs, but here we have explicit start commands in CLI class?
    // CLI.createContainer uses `run` command which behaves like docker run.
    // docker run starts it.
    // BUT if we caught "exists", it might be stopped.
    // So ensuring start is good.
    await this.cli.startContainer(created.id ?? containerName);
    await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for startup

    // Inject SSH key immediately after container is waiting
    await this.injectSshKey(created.id ?? containerName, sshKey, resolved.remoteUser);

    this.appliedState.set(folder.uri.toString(), resolved);

    // Update Local SSH Config
    const sshPort = this.detectForwardedPort(resolved.ports, 22) ?? '2222'; // Default fallback or error?
    await sshManager.updateConfig(containerName, sshPort, resolved.remoteUser);

    await this.runPostCommands(created.id ?? containerName, resolved, {
      runCreate: Boolean(resolved.postCreateCommand),
      runStart: Boolean(resolved.postStartCommand)
    });

    void vscode.window.showInformationMessage(`Devcontainer ${containerName} is ready.`);
  }

  private async injectSshKey(containerId: string, pubKey: string, user?: string): Promise<void> {
    const execOptions: ContainerExecOptions = {
      user: user,
      tty: false,
      interactive: false
    };

    const cmd = [
      '/bin/sh',
      '-c',
      `mkdir -p ~/.ssh && echo "${pubKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`
    ];

    try {
      await this.cli.execInContainer(containerId, cmd, execOptions);
      await this.delay(vscode.workspace.getConfiguration('appleContainer').get<number>('cli.executionCoolDown', 3000)); // Wait for key injection
      logInfo(`Injected SSH key for ${user ?? 'default user'} in ${containerId}`);
    } catch (e) {
      logWarn(`Failed to inject SSH key: ${e}`);
      // This might fail if the user doesn't exist yet or permissions are strict, but we try our best.
    }

  }

  async rebuildDevcontainer(): Promise<void> {
    await this.applyDevcontainer({ rebuild: true });
  }

  async buildDevcontainer(): Promise<void> {
    const folder = await this.pickWorkspaceFolder();
    if (!folder) {
      return;
    }

    const workspacePath = folder.uri.fsPath;
    const loaded = await this.loadConfig(workspacePath);
    if (!loaded) {
      void vscode.window.showWarningMessage('No devcontainer configuration found in this workspace.');
      return;
    }

    const resolved = this.resolveConfig(loaded.config, workspacePath);
    if (!resolved.build) {
      void vscode.window.showInformationMessage('Devcontainer configuration does not define a build section.');
      return;
    }

    logInfo(`Building devcontainer image from ${path.relative(workspacePath, loaded.path)}`);
    await this.executeImageBuild(resolved);
    this.appliedState.set(folder.uri.toString(), resolved);
    void vscode.window.showInformationMessage(`Devcontainer image ${resolved.image} built successfully.`);
  }

  async runPostLifecycle(): Promise<void> {
    const folder = await this.pickWorkspaceFolder();
    if (!folder) {
      return;
    }

    const resolved = await this.getResolvedConfig(folder);
    if (!resolved) {
      void vscode.window.showWarningMessage('No devcontainer has been applied for this workspace yet.');
      return;
    }

    const container = await this.waitForContainer(resolved.name, 3_000);
    if (!container) {
      void vscode.window.showWarningMessage(`Container ${resolved.name} not found or not running.`);
      return;
    }

    await this.runPostCommands(container.id ?? resolved.name, resolved, {
      runCreate: Boolean(resolved.postCreateCommand),
      runStart: Boolean(resolved.postStartCommand)
    });
  }

  async showOpenInstructions(): Promise<void> {
    const folder = await this.pickWorkspaceFolder();
    if (!folder) {
      return;
    }

    const resolved = await this.getResolvedConfig(folder);
    if (!resolved) {
      void vscode.window.showWarningMessage('Apply a devcontainer before attempting to open it.');
      return;
    }

    const sshPort = this.detectForwardedPort(resolved.ports, 22);
    const messageLines = [
      `Container: ${resolved.name}`,
      `Remote user: ${resolved.remoteUser ?? 'default (root or container default)'}`,
      `Workspace folder: ${resolved.workspaceFolder}`,
      sshPort ? `Forwarded SSH port: ${sshPort}` : 'Configure port forwarding for SSH (22) in devcontainer.json.'
    ];

    const copyItem = 'Copy Instructions';
    const openSSHDocs = 'View Remote-SSH Guide';
    void vscode.window.showInformationMessage(messageLines.join('\n'), copyItem, openSSHDocs).then(selection => {
      if (selection === copyItem) {
        void vscode.env.clipboard.writeText(messageLines.join('\n'));
        void vscode.window.showInformationMessage('Devcontainer connection details copied to clipboard.');
      } else if (selection === openSSHDocs) {
        void vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/docs/remote/ssh'));
      }
    });
  }

  async reopenInContainer(): Promise<void> {
    const folder = await this.pickWorkspaceFolder();
    if (!folder) {
      return;
    }

    const loaded = await this.loadConfig(folder.uri.fsPath);
    if (!loaded) {
      void vscode.window.showWarningMessage('No devcontainer configuration found.');
      return;
    }

    const resolved = this.resolveConfig(loaded.config, folder.uri.fsPath);
    const containerName = resolved.name;

    // Check if container exists, if not create it
    const existing = await this.findContainerByName(containerName);
    if (!existing) {
      await this.applyDevcontainer();
    } else {
      // Ensure it is running
      // We can assume if it exists we might just need to start or restart it?
      // For now, let's just make sure it's ready.
      // Actually applyDevcontainer handles creation logic effectively.
      // But if it exists and runs, applyDevcontainer RECREATES it (destroy & create).
      // We likely want to just START it if stopped, or use it if running.
      // For MVP, let's reuse applyDevcontainer to ensure fresh state, 
      // OR we can implement a lighter "ensureRunning" 
      // Let's rely on applyDevcontainer for now to guarantee state matches config.
      // But wait, "Reopen" usually implies using the existing one if valid.

      // Optimization: If running, just setup SSH and go.
      // Let's assume we want to ensure provisioned.
      // A safer bet for "Reopen" is to just ensure it is running and accessible.
      // But if config changed, we might want to rebuild.
      // Standard VS Code asks. We will just ensure it is running for now.

      // Let's allow applyDevcontainer to handle the heavy lifting of "Make sure this config is applied".
      // Ideally we check if up-to-date.
      // For this iteration: Reuse applyDevcontainer (Destroy/Create) to be safe, 
      // but maybe we should allow "Attach" behavior later.

      // Actually, to make "reopen" fast, we shouldn't destroy if not needed.
      // Let's try to start it if stopped.
      // If running, good.
    }

    // We need to ensure the container is running and SSH is ready.
    // Let's force a "refresh/apply" to ensuring everything is consistent.
    await this.applyDevcontainer();

    // Now construct the SSH URI
    const sshHost = `acm-${containerName}`;
    const workdir = resolved.workspaceFolder;

    // The URI format for Remote SSH is:
    // vscode-remote://ssh-remote+<host>/<path>
    const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${sshHost}${workdir}`);

    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
  }

  private async executeImageBuild(resolved: ResolvedConfig): Promise<void> {
    if (!resolved.build) {
      return;
    }

    logInfo(`Building image ${resolved.image} with ${resolved.build.tags.length} tag(s).`);
    try {
      await this.cli.buildImage({
        context: resolved.build.context,
        dockerfile: resolved.build.dockerfile,
        tags: resolved.build.tags,
        buildArgs: resolved.build.args,
        labels: resolved.build.labels,
        target: resolved.build.target,
        noCache: resolved.build.noCache,
        platform: resolved.build.platform,
        arch: resolved.build.arch,
        os: resolved.build.os,
        cpus: resolved.build.cpus,
        memory: resolved.build.memory,
        quiet: resolved.build.quiet,
        progress: resolved.build.progress,
        additionalOptions: resolved.build.additionalOptions,
        cwd: resolved.workspacePath
      });
      logInfo(`Image build completed for ${resolved.image}`);
    } catch (error) {
      const containerError = toAppleContainerError(error);
      logError(`Image build failed for ${resolved.name}`, containerError);
      throw new AppleContainerError(`Image build failed: ${containerError.message}`, ErrorCode.CommandFailed, containerError);
    }
  }

  private async runPostCommands(
    containerId: string,
    resolved: ResolvedConfig,
    stages: { runCreate: boolean; runStart: boolean }
  ): Promise<void> {
    if (stages.runCreate && resolved.postCreateCommand) {
      await this.executeLifecycleCommand(containerId, 'postCreateCommand', resolved.postCreateCommand, resolved);
    }

    if (stages.runStart && resolved.postStartCommand) {
      await this.executeLifecycleCommand(containerId, 'postStartCommand', resolved.postStartCommand, resolved);
    }
  }

  private async executeLifecycleCommand(
    containerId: string,
    label: 'postCreateCommand' | 'postStartCommand',
    command: DevcontainerCommand,
    resolved: ResolvedConfig
  ): Promise<void> {
    const spec = this.prepareCommand(command);
    const execOptions: ContainerExecOptions = {
      user: resolved.remoteUser,
      workdir: resolved.workspaceFolder,
      env: resolved.containerEnv,
      tty: false,
      interactive: false
    };

    logInfo(`Executing ${label} in container ${containerId}: ${spec.display} `);
    try {
      const { stdout, stderr } = await this.cli.execInContainer(containerId, spec.argv, execOptions);
      if (stdout?.trim().length) {
        log(stdout.trim());
      }
      if (stderr?.trim().length) {
        logWarn(stderr.trim());
      }
    } catch (error) {
      const containerError = toAppleContainerError(error);
      logError(`Failed to execute ${label} for container ${resolved.name}`, containerError);
      throw new AppleContainerError(`Failed to run ${label}: ${containerError.message} `, ErrorCode.CommandFailed, containerError);
    }
  }

  private prepareCommand(command: DevcontainerCommand): { argv: string[]; display: string } {
    if (Array.isArray(command)) {
      return {
        argv: command,
        display: command.join(' ')
      };
    }

    const trimmed = command.trim();
    if (!trimmed.length) {
      return {
        argv: ['/bin/sh', '-c', ''],
        display: '(empty command)'
      };
    }

    return {
      argv: ['/bin/sh', '-c', trimmed],
      display: trimmed
    };
  }

  private async waitForContainer(name: string, timeoutMs: number): Promise<{ id?: string } | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const containers = await this.cli.listContainers();
      const match = containers.find(container => container.name === name || container.id === name);
      if (match) {
        // Wait a bit after finding it to ensure state stabilizes, as requested by user
        // Although this is inside a read loop, ensuring we don't return too fast after it appears might help.
        // But user asked for delay after CLI ops.
        // listContainers is the op. 
        // Let's rely on the explicit delay I will add in applyDevcontainer.
        return { id: match.id };
      }
      await this.delay(500);
    }
    return undefined;
  }

  private async stopContainerIfRunning(id: string, name: string): Promise<void> {
    try {
      await this.cli.stopContainer(id);
      logInfo(`Stopped container ${name} `);
    } catch {
      logWarn(`Failed to stop container ${name}; continuing with removal.`);
    }
  }

  private async removeContainer(id: string, name: string): Promise<void> {
    try {
      await this.cli.removeContainer(id);
      logInfo(`Removed container ${name}`);
    } catch (error) {
      const containerError = toAppleContainerError(error);
      // If the container config is missing, it's a "zombie" container. We can generally consider it removed 
      // (or at least we can't do anything more about it via the CLI).
      // The error typically contains "No such file or directory" or "config.json".
      if (containerError.message.includes('No such file or directory') || containerError.message.includes('config.json')) {
        logWarn(`Ignored removal error for likely zombie container ${name}: ${containerError.message}`);
        return;
      }

      logError(`Failed to remove container ${name}`, containerError);
      throw containerError;
    }
  }

  private toCreateOptions(resolved: ResolvedConfig): ContainerCreateOptions {
    const additionalArgs = [...resolved.additionalArgs];
    for (const [key, value] of Object.entries(resolved.containerEnv)) {
      if (typeof value === 'string') {
        additionalArgs.push('--env', `${key}=${value} `);
      }
    }

    return {
      image: resolved.image,
      name: resolved.name,
      cpus: resolved.cpus,
      memory: resolved.memory,
      ports: resolved.ports,
      volumes: resolved.volumes,
      additionalArgs,
      command: ['sleep', 'infinity']
    };
  }

  private async findContainerByName(name: string): Promise<{ id: string } | undefined> {
    const containers = await this.cli.listContainers();
    const match = containers.find(container => container.name === name || container.id === name);
    if (!match) {
      return undefined;
    }
    return { id: match.id };
  }

  private async getResolvedConfig(folder: vscode.WorkspaceFolder): Promise<ResolvedConfig | undefined> {
    const cached = this.appliedState.get(folder.uri.toString());
    if (cached) {
      return cached;
    }

    const loaded = await this.loadConfig(folder.uri.fsPath);
    if (!loaded) {
      return undefined;
    }

    const resolved = this.resolveConfig(loaded.config, folder.uri.fsPath);
    this.appliedState.set(folder.uri.toString(), resolved);
    return resolved;
  }

  private async loadConfig(workspacePath: string): Promise<LoadedConfig | undefined> {
    const candidatePaths = [
      path.join(workspacePath, '.appcontainer', 'devcontainer.json'),
      path.join(workspacePath, '.appcontainer.json')
    ];

    for (const candidate of candidatePaths) {
      try {
        const content = await fs.readFile(candidate, 'utf8');
        const config = this.parseConfig(content);
        if (config) {
          return { config, path: candidate };
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logWarn(`Failed to read devcontainer configuration at ${candidate} `);
        }
      }
    }

    return undefined;
  }

  private parseConfig(content: string): DevcontainerConfig | undefined {
    const sanitized = this.stripJsonComments(content);
    try {
      const parsed = JSON.parse(sanitized) as DevcontainerConfig;
      return parsed;
    } catch (error) {
      logError('Failed to parse devcontainer configuration', error);
      return undefined;
    }
  }

  private resolveConfig(config: DevcontainerConfig, workspacePath: string): ResolvedConfig {
    const workspaceBasename = path.basename(workspacePath);
    const defaultWorkspaceFolder = `/ workspaces / ${workspaceBasename} `;

    const defaultContext: VariableContext = {
      workspaceFolder: workspacePath,
      workspaceBasename,
      containerWorkspaceFolder: defaultWorkspaceFolder,
      env: process.env
    };

    const workspaceFolderRaw = config.workspaceFolder ?? defaultWorkspaceFolder;
    const workspaceFolder = this.resolveVariables(workspaceFolderRaw, defaultContext);
    const variableContext: VariableContext = {
      ...defaultContext,
      containerWorkspaceFolder: workspaceFolder
    };

    const runArgsResult = this.parseRunArgs(config.runArgs ?? []);

    const fallbackImage = this.generateImageTag(workspaceBasename);
    const imageCandidate = config.image ? this.resolveVariables(config.image, variableContext) : undefined;
    const build = config.build
      ? this.resolveBuild(config.build, variableContext, workspacePath, imageCandidate ?? fallbackImage)
      : undefined;

    const resolvedImage = imageCandidate ?? build?.tags[0] ?? '';

    if (!resolvedImage) {
      throw new AppleContainerError('devcontainer.json must provide either an "image" or a build definition.', ErrorCode.CommandFailed);
    }

    if (build && !build.tags.includes(resolvedImage)) {
      build.tags = [resolvedImage, ...build.tags];
    }

    const resolved: ResolvedConfig = {
      name: this.resolveName(config.name, workspaceBasename),
      image: resolvedImage,
      remoteUser: config.remoteUser ?? runArgsResult.user,
      workspaceFolder,
      workspacePath,
      ports: this.resolvePorts(config.forwardPorts),
      volumes: this.resolveVolumes(config.mounts, variableContext, workspacePath, workspaceFolder),
      cpus: runArgsResult.cpus,
      memory: runArgsResult.memory,
      additionalArgs: runArgsResult.additional,
      containerEnv: this.resolveEnv(config.containerEnv ?? {}, variableContext),
      postCreateCommand: config.postCreateCommand,
      postStartCommand: config.postStartCommand,
      build
    };

    return resolved;
  }

  private resolveName(name: string | undefined, basename: string): string {
    if (name?.trim()) {
      return name.trim();
    }
    return `acm - ${basename} `;
  }

  private resolveBuild(
    build: DevcontainerBuildConfig,
    context: VariableContext,
    workspacePath: string,
    fallbackImage: string
  ): ResolvedBuildConfig {
    const contextValue = build.context ? this.resolveVariables(build.context, context) : '.';
    const contextPath = path.isAbsolute(contextValue)
      ? contextValue
      : path.resolve(workspacePath, contextValue);

    let dockerfilePath: string | undefined;
    if (build.dockerfile) {
      const dockerfileValue = this.resolveVariables(build.dockerfile, context);
      dockerfilePath = path.isAbsolute(dockerfileValue)
        ? dockerfileValue
        : path.resolve(contextPath, dockerfileValue);
    }

    const args = this.resolveEnv(build.args ?? {}, context);
    const labels = this.resolveEnv(build.labels ?? {}, context);

    const target = build.target ? this.resolveVariables(build.target, context) : undefined;
    const platform = build.platform ? this.resolveVariables(build.platform, context) : undefined;
    const arch = build.arch ? this.resolveVariables(build.arch, context) : undefined;
    const osValue = build.os ? this.resolveVariables(build.os, context) : undefined;
    const memory = build.memory ? this.resolveVariables(build.memory, context) : undefined;

    let cpus: number | undefined;
    if (typeof build.cpus === 'number') {
      cpus = build.cpus;
    } else if (typeof build.cpus === 'string') {
      const resolvedCpu = this.resolveVariables(build.cpus, context);
      const parsedCpu = Number.parseFloat(resolvedCpu);
      cpus = Number.isNaN(parsedCpu) ? undefined : parsedCpu;
    }

    const additionalOptions = (build.options ?? [])
      .map(option => this.resolveVariables(option, context))
      .filter(option => option.trim().length > 0);

    const tagSet = new Set<string>();

    const addTag = (tag?: string): void => {
      if (!tag) {
        return;
      }
      const trimmed = tag.trim();
      if (trimmed.length > 0) {
        tagSet.add(trimmed);
      }
    };

    if (typeof build.image === 'string') {
      addTag(this.resolveVariables(build.image, context));
    } else if (Array.isArray(build.image)) {
      for (const tag of build.image) {
        addTag(this.resolveVariables(tag, context));
      }
    }

    for (const tag of build.additionalImageTags ?? []) {
      addTag(this.resolveVariables(tag, context));
    }

    addTag(fallbackImage);

    const tags = Array.from(tagSet.values());

    return {
      context: contextPath,
      dockerfile: dockerfilePath,
      args,
      labels,
      target,
      noCache: build.noCache ?? false,
      platform,
      arch,
      os: osValue,
      cpus,
      memory,
      progress: build.progress,
      quiet: build.quiet,
      additionalOptions,
      tags
    };
  }

  private generateImageTag(basename: string): string {
    const slug = basename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const safeSlug = slug.length > 0 ? slug : 'workspace';
    return `acm / ${safeSlug}: dev`;
  }

  private resolvePorts(forwardPorts: DevcontainerConfig['forwardPorts']): string[] {
    if (!Array.isArray(forwardPorts)) {
      return [];
    }

    const ports = new Set<string>();
    for (const entry of forwardPorts) {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        ports.add(`${entry}:${entry} `);
        continue;
      }

      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.length === 0) {
          continue;
        }
        const parts = trimmed.split(':');
        if (parts.length === 1) {
          const value = parts[0];
          ports.add(`${value}:${value} `);
        } else if (parts.length === 2 || parts.length === 3) {
          ports.add(trimmed);
        }
      }
    }

    return Array.from(ports);
  }

  private resolveVolumes(
    mounts: string[] | undefined,
    context: VariableContext,
    workspacePath: string,
    workspaceFolder: string
  ): ResolvedConfig['volumes'] {
    const volumes: ResolvedConfig['volumes'] = [];

    const workspaceVolume = {
      source: workspacePath,
      target: workspaceFolder,
      readOnly: false
    };
    volumes.push(workspaceVolume);

    for (const mount of mounts ?? []) {
      const parsed = this.parseMount(mount, context);
      if (!parsed) {
        continue;
      }

      if (parsed.target === workspaceFolder && parsed.source === workspacePath) {
        continue;
      }

      volumes.push(parsed);
    }

    return volumes;
  }

  private parseMount(entry: string, context: VariableContext): ResolvedConfig['volumes'][number] | undefined {
    if (!entry?.trim()) {
      return undefined;
    }

    const segments = entry.split(',').map(segment => segment.trim()).filter(Boolean);
    let source: string | undefined;
    let target: string | undefined;
    let readOnly = false;

    for (const segment of segments) {
      if (segment === 'ro') {
        readOnly = true;
        continue;
      }
      if (segment === 'rw') {
        readOnly = false;
        continue;
      }

      const [rawKey, rawValue] = segment.split('=', 2);
      const key = rawKey.trim();
      const value = rawValue?.trim() ?? '';

      if (!key) {
        continue;
      }

      const resolvedValue = this.resolveVariables(value, context);
      switch (key) {
        case 'source':
        case 'src':
          source = resolvedValue;
          break;
        case 'target':
        case 'dst':
        case 'destination':
          target = resolvedValue;
          break;
        case 'readonly':
        case 'ro':
          readOnly = value === 'true' || value === '1';
          break;
        default:
          break;
      }
    }

    if (!source || !target) {
      return undefined;
    }

    return { source, target, readOnly };
  }

  private resolveEnv(env: Record<string, string>, context: VariableContext): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (!key.trim()) {
        continue;
      }
      resolved[key.trim()] = this.resolveVariables(value, context);
    }
    return resolved;
  }

  private parseRunArgs(runArgs: string[]): RunArgsParseResult {
    const result: RunArgsParseResult = { additional: [] };

    const takeValue = (arg: string, next: string | undefined): { value?: string; consumedCount: number } => {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > -1) {
        return { value: arg.slice(eqIndex + 1), consumedCount: 0 };
      }
      if (next !== undefined) {
        return { value: next, consumedCount: 1 };
      }
      return { consumedCount: 0 };
    };

    for (let index = 0; index < runArgs.length; index += 1) {
      const arg = runArgs[index];
      const next = runArgs[index + 1];
      switch (arg) {
        case '--cpus': {
          const { value, consumedCount } = takeValue(arg, next);
          if (value !== undefined) {
            const parsed = Number.parseFloat(value);
            if (!Number.isNaN(parsed)) {
              result.cpus = parsed;
              index += consumedCount;
              continue;
            }
          }
          break;
        }
        case '--memory': {
          const { value, consumedCount } = takeValue(arg, next);
          if (value) {
            result.memory = value;
            index += consumedCount;
            continue;
          }
          break;
        }
        case '--user':
        case '-u': {
          const { value, consumedCount } = takeValue(arg, next);
          if (value) {
            result.user = value;
            index += consumedCount;
            continue;
          }
          break;
        }
        case '--workdir':
        case '--cwd':
        case '-w': {
          const { value, consumedCount } = takeValue(arg, next);
          if (value) {
            result.workdir = value;
            index += consumedCount;
            continue;
          }
          break;
        }
        default: {
          if (arg.startsWith('--cpus=') || arg.startsWith('--memory=') || arg.startsWith('--user=') || arg.startsWith('--workdir=') || arg.startsWith('--cwd=')) {
            // handled via takeValue logic but fall-through ensures no duplicates
            const { value } = takeValue(arg, next);
            if (arg.startsWith('--cpus=') && value !== undefined) {
              const parsed = Number.parseFloat(value);
              if (!Number.isNaN(parsed)) {
                result.cpus = parsed;
                continue;
              }
            }
            if (arg.startsWith('--memory=') && value) {
              result.memory = value;
              continue;
            }
            if (arg.startsWith('--user=') && value) {
              result.user = value;
              continue;
            }
            if ((arg.startsWith('--workdir=') || arg.startsWith('--cwd=')) && value) {
              result.workdir = value;
              continue;
            }
          }
          result.additional.push(arg);
          break;
        }
      }
    }

    if (result.workdir) {
      result.additional.push('--workdir', result.workdir);
    }

    if (result.user) {
      result.additional.push('--user', result.user);
    }

    return result;
  }

  private resolveVariables(value: string, context: VariableContext): string {
    const pattern = /\$\{([^}]+)\}/g;
    return value.replace(pattern, (_, token: string) => {
      const trimmed = token.trim();
      if (trimmed === 'localWorkspaceFolder') {
        return context.workspaceFolder;
      }
      if (trimmed === 'localWorkspaceFolderBasename') {
        return context.workspaceBasename;
      }
      if (trimmed === 'containerWorkspaceFolder') {
        return context.containerWorkspaceFolder;
      }
      if (trimmed.startsWith('localEnv:')) {
        const key = trimmed.slice('localEnv:'.length);
        return context.env[key] ?? '';
      }
      return '';
    });
  }

  private stripJsonComments(content: string): string {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  private async pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      void vscode.window.showWarningMessage('Open a workspace folder to use devcontainer commands.');
      return undefined;
    }

    if (folders.length === 1) {
      return folders[0];
    }

    const selection = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select a workspace folder to apply devcontainer configuration'
    });
    return selection ?? undefined;
  }

  private detectForwardedPort(ports: string[], containerPort: number): string | undefined {
    for (const spec of ports) {
      const segments = spec.split(':').map(segment => segment.trim()).filter(Boolean);
      if (segments.length === 2) {
        const [hostPort, container] = segments;
        if (Number.parseInt(container, 10) === containerPort) {
          return hostPort;
        }
      }
      if (segments.length === 3) {
        const [, hostPort, container] = segments;
        if (Number.parseInt(container, 10) === containerPort) {
          return hostPort;
        }
      }
    }
    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
