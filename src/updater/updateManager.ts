import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';
import { ContainerCli } from '../cli/containerCli';
import { log, logError, logWarn } from '../core/logger';
import { fetchLatestRelease, GithubRelease, downloadReleaseAsset } from './githubClient';

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
        // Find the installer asset (pkg)
        const asset = release.assets.find(a => a.name === 'container-installer-signed.pkg');
        if (!asset) {
            logError('Auto-update failed: Signed installer PKG not found in release assets.');
            vscode.window.showErrorMessage(`Update ${release.tagName} available but auto-update failed: Installer package not found.`);
            return;
        }

        const tempDir = os.tmpdir();
        const installerPath = path.join(tempDir, `container-installer-${release.tagName}.pkg`);

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating Apple Container to ${release.tagName}`,
                cancellable: false
            }, async (progress) => {
                // 1. Download
                progress.report({ message: 'Downloading installer...' });
                await downloadReleaseAsset(asset.browserDownloadUrl, installerPath);
                log(`Installer downloaded to ${installerPath}`);

                // 2. Prompt user before stopping system
                const confirmation = await vscode.window.showWarningMessage(
                    'The container system must be stopped to proceed with the update. Continue?',
                    { modal: true },
                    'Continue'
                );

                if (confirmation !== 'Continue') {
                    throw new Error('Update cancelled by user.');
                }

                // 3. Stop System
                progress.report({ message: 'Stopping container system...' });
                try {
                    await this.cli.system('stop');
                } catch (error) {
                    logWarn(`Failed to stop system (might not be running): ${error}`);
                }

                // 3. Uninstall (if script exists)
                const uninstallScript = '/usr/local/bin/uninstall-container.sh';
                // Dynamic import fs to check file
                const fs = await import('fs');
                if (fs.existsSync(uninstallScript)) {
                    progress.report({ message: 'Uninstalling old version...' });
                    const uninstallFlag = keepData ? '-k' : '-d';
                    // Escape double quotes for AppleScript: " -> \"
                    const uninstallCmd = `\\"${uninstallScript}\\" ${uninstallFlag}`;

                    // Use osascript to escalate privileges
                    const script = `do shell script "${uninstallCmd}" with administrator privileges`;

                    await new Promise<void>((resolve, reject) => {
                        cp.execFile('osascript', ['-e', script], (error, stdout, stderr) => {
                            if (error) {
                                reject(new Error(`Uninstall failed: ${stderr || error.message}`));
                            } else {
                                resolve();
                            }
                        });
                    });
                } else {
                    log('Uninstall script not found, skipping specific uninstall step.');
                }
            });

            // 4. Launch Installer
            log('Launching installer...');
            const installSelection = await vscode.window.showInformationMessage(
                `Update ${release.tagName} ready. Proceed to install?`,
                'Install Now'
            );

            if (installSelection === 'Install Now') {
                // Launch the installer via 'open' command
                cp.exec(`open "${installerPath}"`, (error) => {
                    if (error) {
                        logError('Failed to launch installer', error);
                        vscode.window.showErrorMessage(`Failed to launch installer: ${error.message}`);
                    } else {
                        log('Installer launched successfully.');
                    }
                });
            }
        } catch (error) {
            logError('Auto-update failed', error);
            vscode.window.showErrorMessage(`Failed to update: ${error instanceof Error ? error.message : String(error)}`);
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
