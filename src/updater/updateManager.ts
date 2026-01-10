import * as vscode from 'vscode';
import { ContainerCli } from '../cli/containerCli';
import { log, logError } from '../core/logger';
import { fetchLatestRelease, GithubRelease } from './githubClient';

export class UpdateManager implements vscode.Disposable {
    private readonly checkIntervalMs = 24 * 60 * 60 * 1000; // 24 hours default, but we'll read config
    private timer: NodeJS.Timeout | undefined;

    constructor(
        private readonly cli: ContainerCli
    ) {
        this.startScheduler();
    }

    dispose(): void {
        this.stopScheduler();
    }

    private startScheduler(): void {
        const config = vscode.workspace.getConfiguration('appleContainer');
        const intervalHours = config.get<number>('update.checkIntervalHours') ?? 24;
        const intervalMs = intervalHours * 60 * 60 * 1000;

        this.check(); // Check immediately on startup
        this.timer = setInterval(() => {
            this.check();
        }, intervalMs);
    }

    private stopScheduler(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    async check(): Promise<void> {
        try {
            const currentVersion = await this.cli.version();
            const release = await fetchLatestRelease();

            if (this.isNewer(release.tagName, currentVersion)) {
                const config = vscode.workspace.getConfiguration('appleContainer');
                const autoUpdate = config.get<boolean>('update.autoUpdate') ?? false;

                if (autoUpdate) {
                    await this.performAutoUpdate(release);
                } else {
                    this.notifyUpdateAvailable(release, currentVersion);
                }
            } else {
                // Determine if we should clear any previous "update available" context?
                // The current SystemTreeProvider handles state, but maybe we should expose this state globally/via events?
                // For now, let's just emit the event or command the tree expects (which is system:status).
                // Actually SystemTreeProvider does its own check or relies on this?
                // The current SystemTreeProvider has a hardcoded initial state.
                // We will leave the TreeProvider to manage the UI update via 'system:status' event if we integrate there
                // OR we can trigger a refresh.
            }
        } catch (error) {
            logError('Update check failed', error);
        }
    }

    private isNewer(latest: string, current: string): boolean {
        // Simple semver check. Remove 'v' prefix if present.
        const cleanLatest = latest.replace(/^v/, '');
        const cleanCurrent = current.replace(/^v/, '');

        // This is a naive comparison, but sufficient for standard x.y.z
        // Use a proper semver library if strictness is needed, but we don't include semver dependency.
        if (cleanLatest === cleanCurrent) { return false; }

        const latestParts = cleanLatest.split('.').map(Number);
        const currentParts = cleanCurrent.split('.').map(Number);

        for (let i = 0; i < latestParts.length; ++i) {
            if (currentParts[i] === undefined) {
                // latest has more parts (e.g. 1.0.1 vs 1.0) -> newer
                return true;
            }
            if (latestParts[i] > currentParts[i]) {
                return true;
            }
            if (latestParts[i] < currentParts[i]) {
                return false;
            }
        }
        return false;
    }

    private async performAutoUpdate(release: GithubRelease): Promise<void> {
        const config = vscode.workspace.getConfiguration('appleContainer');
        const keepData = config.get<boolean>('update.keepData') ?? true;

        log(`Auto-updating to version ${release.tagName} (keepData=${keepData})`);

        // We trigger the upgrade command. 
        // Note: The VS Code command appleContainer.system.upgrade usually opens the release URL 
        // OR runs an upgrade script.
        // Looking at package.json, appleContainer.system.upgrade title is "Open Latest CLI Release".
        // It seems the current extension DOES NOT have built-in upgrade logic (downloading binary). 
        // It just points user to download.
        // The requirement "2.1 Automatic Update" implies implementing this logic.
        // However, as an extension, we might not have permissions to replace a system binary unless 
        // the binary is managed by the extension (e.g. in global storage).
        // Since the binary is 'container' in PATH, we probably simply can't auto-update it automatically
        // unless there is a 'container upgrade' command.

        // Let's check if 'container' CLI has an upgrade command.
        // If not, "Automatic Update" might mean notifying the user more aggressively or running a script.
        // Assuming the USER wants us to implement the logic to download and replace if possible,
        // OR use a CLI command. Update: The user request says "github has update... auto update".

        // Implementation assumption: We will try to run `container upgrade` if it exists, 
        // or we need to clarify. 
        // Re-reading task: "github 有更新版本后，可选择自动更新。"

        // If the CLI doesn't have self-update, we might need to download the asset.
        // Given I am inside the extension, replacing a system binary (if in /usr/local/bin) is hard (EPERM).
        // BUT, maybe the 'container' binary is just a wrapper or the user expects us to try.

        // Let's assume for now we notify the user heavily or try to check if `container upgrade` exists.
        // Based on `container --help`, there was no `upgrade` command shown in the previous output overview 
        // (Usage: stop ...).
        // Let's assume we invoke a hypothetical `container upgrade` or `system upgrade` if it existed.
        // Wait, `container system.ts` has `appleContainer.system.upgrade` command. 
        // Let's see what that command does in `extension.ts`.

        // I will write this file as a placeholder that notifies for now, then I'll check `extension.ts` to see what upgrade does.
        vscode.window.showInformationMessage(`New version ${release.tagName} available. Auto-update is enabled but requires manual download for system-wide install.`, 'Open Release').then(sel => {
            if (sel === 'Open Release') {
                vscode.env.openExternal(vscode.Uri.parse(release.htmlUrl));
            }
        });
    }

    private notifyUpdateAvailable(release: GithubRelease, current: string): void {
        const message = `Apple Container CLI update available: ${release.tagName} (Current: ${current})`;
        vscode.window.showInformationMessage(message, 'View Release').then(selection => {
            if (selection === 'View Release') {
                vscode.env.openExternal(vscode.Uri.parse(release.htmlUrl));
            }
        });
    }
}
