import * as vscode from 'vscode';
import * as cp from 'child_process';
import { ContainerCli } from '../cli/containerCli';
import { log, logError, logWarn } from '../core/logger';
import { fetchLatestRelease, GithubRelease } from './githubClient';

export class UpdateManager implements vscode.Disposable {
    private readonly checkIntervalMs = 24 * 60 * 60 * 1000; // 24 hours default, but we'll read config
    private timer: NodeJS.Timeout | undefined;

    constructor(
        private readonly cli: ContainerCli,
        private readonly context: vscode.ExtensionContext
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

    async manualCheck(): Promise<void> {
        await this.check(true);
    }

    async check(isManual = false): Promise<void> {
        try {
            const currentVersion = await this.cli.version();
            const release = await fetchLatestRelease();

            if (this.isNewer(release.tagName, currentVersion)) {
                // Check if skipped
                const skippedVersion = this.context.globalState.get<string>('appleContainer.skippedVersion');
                if (!isManual && skippedVersion === release.tagName) {
                    log(`Skipping update check for ${release.tagName} (user skipped).`);
                    return;
                }

                const config = vscode.workspace.getConfiguration('appleContainer');
                const autoUpdate = config.get<boolean>('update.autoUpdate') ?? false;

                if (autoUpdate || isManual) {
                    await this.performAutoUpdate(release);
                } else {
                    this.notifyUpdateAvailable(release, currentVersion);
                }
            } else {
                if (isManual) {
                    void vscode.window.showInformationMessage(`You are on the latest container CLI version (${currentVersion}).`);
                }
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
            if (isManual) {
                void vscode.window.showErrorMessage(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
            }
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

        // Prompt for confirmation
        const selection = await vscode.window.showInformationMessage(
            `Update ${release.tagName} is available. Do you want to install it?`,
            { modal: true },
            'Yes', 'No', 'Skip this version'
        );

        if (selection === 'No' || !selection) {
            return;
        }

        if (selection === 'Skip this version') {
            await this.context.globalState.update('appleContainer.skippedVersion', release.tagName);
            log(`User skipped version ${release.tagName}`);
            return;
        }

        // Proceed with 'Yes'
        const fs = await import('fs');
        const updateScript = '/usr/local/bin/update-container.sh';

        if (fs.existsSync(updateScript)) {
            log(`Found update script: ${updateScript}. Using it for upgrade.`);
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Updating Apple Container to ${release.tagName}`,
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Initializing system update...' });

                    // 1. Stop System first to be safe (it might be required by the script, or just good practice)
                    try {
                        await this.cli.system('stop');
                    } catch (error) {
                        logWarn(`Failed to stop system before script update: ${error}`);
                    }

                    progress.report({ message: 'Running update script (requires password)...' });
                    
                    // Use osascript to escalate privileges for the update script
                    // Note: we use double backslashes to escape the double quotes for the shell command inside the AppleScript string
                    const script = `do shell script "\\"${updateScript}\\"" with administrator privileges`;

                    await new Promise<void>((resolve, reject) => {
                        cp.execFile('osascript', ['-e', script], (error, stdout, stderr) => {
                            if (error) {
                                reject(new Error(`Update script failed: ${stderr || error.message}`));
                            } else {
                                if (stdout) { log(`Update script stdout: ${stdout}`); }
                                if (stderr) { logWarn(`Update script stderr: ${stderr}`); }
                                resolve();
                            }
                        });
                    });
                });
                
                void vscode.window.showInformationMessage(`Apple Container updated successfully to ${release.tagName}.`);
                return; // Successful update, stop here
            } catch (error) {
                logError('Update script execution failed', error);
                vscode.window.showErrorMessage(`Update script failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            logError(`Update script not found at ${updateScript}`);
            vscode.window.showErrorMessage(`Update failed: ${updateScript} not found. Please ensure the latest container tool is installed.`);
        }
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
