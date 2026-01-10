import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import { log, logError } from '../core/logger';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class SshManager {
    private readonly sshDir: string;
    private readonly configPath: string;
    private readonly keyPath: string;

    constructor() {
        this.sshDir = path.join(os.homedir(), '.ssh');
        this.configPath = path.join(this.sshDir, 'config');
        this.keyPath = path.join(this.sshDir, 'id_ed25519_acm'); // Specialized key for Apple Containers
    }

    async ensureSshKey(): Promise<string> {
        try {
            await fs.mkdir(this.sshDir, { recursive: true, mode: 0o700 });

            try {
                const pubKey = await fs.readFile(`${this.keyPath}.pub`, 'utf8');
                return pubKey.trim();
            } catch {
                // Key doesn't exist, generate it
            }

            log('Generating new SSH key for Apple Container Manager...');
            await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-f', this.keyPath, '-N', '', '-C', 'apple-container-manager']);

            const pubKey = await fs.readFile(`${this.keyPath}.pub`, 'utf8');
            return pubKey.trim();
        } catch (error) {
            logError('Failed to ensure SSH key', error);
            throw error;
        }
    }

    async updateConfig(containerName: string, port: string | number, user: string = 'root'): Promise<void> {
        try {
            const hostEntry = `
Host acm-${containerName}
    HostName localhost
    User ${user}
    Port ${port}
    IdentityFile ${this.keyPath}
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ControlMaster auto
    ControlPath ~/.ssh/acm-%C
    ControlPersist 10m
    ServerAliveInterval 15
    ServerAliveCountMax 20
    TCPKeepAlive yes
    ConnectTimeout 60
`;

            let configContent = '';
            try {
                configContent = await fs.readFile(this.configPath, 'utf8');
            } catch {
                // Config doesn't exist
            }

            const markerStart = `# start-acm-${containerName}`;
            const markerEnd = `# end-acm-${containerName}`;

            const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g');

            let newContent = configContent;
            const entry = `${markerStart}${hostEntry}${markerEnd}`;

            if (regex.test(configContent)) {
                newContent = configContent.replace(regex, entry);
            } else {
                newContent = `${configContent}\n${entry}`;
            }

            // Cleanup multiple newlines
            newContent = newContent.replace(/\n{3,}/g, '\n\n');

            await fs.writeFile(this.configPath, newContent, { mode: 0o600 });
            log(`Updated SSH config for acm-${containerName} (Port ${port}, User ${user})`);

        } catch (error) {
            logError('Failed to update SSH config', error);
            throw error;
        }
    }
}
