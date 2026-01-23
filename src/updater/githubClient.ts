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


export const downloadReleaseAsset = async (url: string, destinationPath: string): Promise<void> => {
  log(`Downloading asset from ${url} to ${destinationPath}`);
  const fs = await import('fs');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);

    const request = https.get(url, {
      headers: {
        'User-Agent': 'AppleContainerManagerVSCode',
        Accept: 'application/octet-stream'
      }
    }, response => {
      if (response.statusCode && response.statusCode >= 400) {
        if (response.statusCode === 302 && response.headers.location) {
          // Handle redirect
          file.close();
          downloadReleaseAsset(response.headers.location, destinationPath)
            .then(resolve)
            .catch(reject);
          return;
        }
        const message = `GitHub asset download failed with status ${response.statusCode}`;
        const error = new AppleContainerError(message, ErrorCode.NetworkError);
        logError(message, error);
        reject(error);
        return;
      }

      // If it's a redirect (302)
      if (response.statusCode === 302 && response.headers.location) {
        file.close();
        downloadReleaseAsset(response.headers.location, destinationPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        log(`Download completed: ${destinationPath}`);
        resolve();
      });
    });

    request.on('error', error => {
      try {
        fs.unlinkSync(destinationPath);
      } catch { /* ignore */ }
      const wrapped = new AppleContainerError('GitHub asset download request failed', ErrorCode.NetworkError, error);
      logError(wrapped.message, wrapped);
      reject(wrapped);
    });
  });
};
