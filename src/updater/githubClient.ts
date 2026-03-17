import https from 'node:https';

import { AppleContainerError, ErrorCode } from '../core/errors';
import { log, logError } from '../core/logger';

export interface GithubReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  contentType: string;
}

export interface GithubRelease {
  tagName: string;
  htmlUrl: string;
  publishedAt?: string;
  assets: GithubReleaseAsset[];
}

const RELEASE_URL = 'https://api.github.com/repos/apple/container/releases/latest';

export const fetchLatestRelease = async (): Promise<GithubRelease> => {
  log('Checking latest container CLI release from GitHub');

  return new Promise((resolve, reject) => {
    https
      .get(RELEASE_URL, {
        headers: {
          'User-Agent': 'AppleContainerManagerVSCode',
          Accept: 'application/vnd.github+json'
        }
      }, res => {
        if (res.statusCode && res.statusCode >= 400) {
          const message = `GitHub API request failed with status ${res.statusCode}`;
          const error = new AppleContainerError(message, ErrorCode.NetworkError);
          logError(message, error);
          reject(error);
          res.resume();
          return;
        }

        let body = '';
        res.on('data', chunk => {
          body += chunk.toString();
        });

        res.on('end', () => {
          try {
            const data = JSON.parse(body) as {
              tag_name?: string;
              html_url?: string;
              published_at?: string;
              assets?: {
                name?: string;
                browser_download_url?: string;
                content_type?: string;
              }[];
            };

            if (!data.tag_name) {
              throw new AppleContainerError('GitHub response missing tag_name', ErrorCode.NetworkError);
            }

            const assets: GithubReleaseAsset[] = (data.assets ?? []).map(asset => ({
              name: asset.name ?? '',
              browserDownloadUrl: asset.browser_download_url ?? '',
              contentType: asset.content_type ?? ''
            }));

            resolve({
              tagName: data.tag_name,
              htmlUrl: data.html_url ?? 'https://github.com/apple/container/releases/latest',
              publishedAt: data.published_at,
              assets
            });
          } catch (error) {
            reject(new AppleContainerError('Failed to parse GitHub response', ErrorCode.NetworkError, error));
          }
        });
      })
      .on('error', error => {
        reject(new AppleContainerError('GitHub request failed', ErrorCode.NetworkError, error));
      });
  });
};


export const downloadReleaseAsset = async (url: string, destinationPath: string, maxRedirects = 10): Promise<void> => {
  log(`Downloading asset from ${url} to ${destinationPath}`);
  const fs = await import('fs');

  if (maxRedirects <= 0) {
    throw new AppleContainerError('Too many redirects while downloading asset', ErrorCode.NetworkError);
  }

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : https;
    const file = fs.createWriteStream(destinationPath);

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'AppleContainerManagerVSCode',
        Accept: 'application/octet-stream'
      }
    }, response => {
      const statusCode = response.statusCode ?? 0;

      // Handle redirects (301, 302, 307, 308) BEFORE checking for errors
      if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
        file.close();
        try { fs.unlinkSync(destinationPath); } catch { /* ignore */ }
        log(`Following redirect (${statusCode}) to ${response.headers.location}`);
        downloadReleaseAsset(response.headers.location, destinationPath, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        response.resume();
        return;
      }

      if (statusCode >= 400) {
        file.close();
        try { fs.unlinkSync(destinationPath); } catch { /* ignore */ }
        const message = `GitHub asset download failed with status ${statusCode}`;
        const error = new AppleContainerError(message, ErrorCode.NetworkError);
        logError(message, error);
        reject(error);
        response.resume();
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          // Verify file was actually written
          try {
            const stats = fs.statSync(destinationPath);
            if (stats.size === 0) {
              try { fs.unlinkSync(destinationPath); } catch { /* ignore */ }
              reject(new AppleContainerError('Downloaded file is empty', ErrorCode.NetworkError));
              return;
            }
            log(`Download completed: ${destinationPath} (${stats.size} bytes)`);
            resolve();
          } catch (statError) {
            reject(new AppleContainerError('Downloaded file not found after write', ErrorCode.NetworkError, statError));
          }
        });
      });

      file.on('error', (fileError) => {
        try { fs.unlinkSync(destinationPath); } catch { /* ignore */ }
        reject(new AppleContainerError('Failed to write downloaded file', ErrorCode.NetworkError, fileError));
      });
    });

    request.on('error', error => {
      try { fs.unlinkSync(destinationPath); } catch { /* ignore */ }
      const wrapped = new AppleContainerError('GitHub asset download request failed', ErrorCode.NetworkError, error);
      logError(wrapped.message, wrapped);
      reject(wrapped);
    });
  });
};
