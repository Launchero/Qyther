import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { pipeline } from 'stream';
import { promisify } from 'util';
import extractZip from 'extract-zip';
import type { IncomingMessage } from 'http';
import { isWindows } from './platform';

const pipelineAsync = promisify(pipeline);

// GitHub API URL to get latest release
const GITHUB_API_URL = 'https://api.github.com/repos/voidtools/ES/releases/latest';
const ES_FILENAME = 'es.exe';
const ES_ZIP_FILENAME = 'es.zip';

function log(message: string, ...args: unknown[]) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [ES Downloader] ${message}`, ...args);
}

/**
 * Get the directory where es.exe should be stored
 * Uses app.getPath('userData') for proper Electron app data storage
 */
function getEsDirectory(): string {
  // Always use the app's user data directory for consistency
  const userDataPath = app.getPath('userData');
  log('Using userData path:', userDataPath);
  return userDataPath;
}

/**
 * Get the full path to es.exe
 */
function getEsPath(): string {
  return path.join(getEsDirectory(), ES_FILENAME);
}

/**
 * Check if es.exe already exists
 */
export function esExists(): boolean {
  const esPath = getEsPath();
  return fs.existsSync(esPath);
}

/**
 * Fetch the download URL from GitHub Releases API
 */
async function getDownloadUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(GITHUB_API_URL, {
      headers: {
        'User-Agent': 'Raycast-Clone-Launcher',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const release = JSON.parse(data);
          // Find the x64 ZIP asset (64-bit Windows)
          const asset = release.assets?.find((a: any) => a.name === 'ES-1.1.0.36.x64.zip' || a.name.endsWith('.x64.zip'));
          
          if (!asset) {
            // Fallback to any ZIP file
            const fallbackAsset = release.assets?.find((a: any) => a.name.endsWith('.zip'));
            if (fallbackAsset) {
              resolve(fallbackAsset.browser_download_url);
              return;
            }
            reject(new Error('No ZIP asset found in latest release'));
            return;
          }
          
          resolve(asset.browser_download_url);
        } catch (error) {
          reject(new Error(`Failed to parse GitHub API response: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Failed to fetch release info: ${err.message}`));
    });
  });
}

/**
 * Download and extract es.exe from GitHub Releases
 */
export async function downloadEs(): Promise<void> {
  const esPath = getEsPath();
  const esDir = getEsDirectory();
  const zipPath = path.join(esDir, ES_ZIP_FILENAME);

  log('Starting es.exe download');
  log(`Destination directory: ${esDir}`);

  // Ensure directory exists
  if (!fs.existsSync(esDir)) {
    fs.mkdirSync(esDir, { recursive: true });
    log(`Created directory: ${esDir}`);
  }

  try {
    // Get the actual download URL from GitHub API
    const downloadUrl = await getDownloadUrl();
    log(`Download URL: ${downloadUrl}`);

    // Download ZIP file
    await downloadFile(downloadUrl, zipPath);
    log('ZIP download complete');

    // Extract ZIP
    log('Extracting ZIP...');
    await extractZip(zipPath, { dir: esDir });
    log('ZIP extracted');

    // Find es.exe in extracted files
    const extractedEsPath = path.join(esDir, 'es.exe');
    if (!fs.existsSync(extractedEsPath)) {
      // Try to find es.exe in subdirectory
      const files = fs.readdirSync(esDir);
      for (const file of files) {
        const fullPath = path.join(esDir, file);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          const subFiles = fs.readdirSync(fullPath);
          for (const subFile of subFiles) {
            if (subFile === 'es.exe' || subFile === 'es64.exe') {
              const sourcePath = path.join(fullPath, subFile);
              fs.copyFileSync(sourcePath, esPath);
              log('Found and copied es.exe from subdirectory');
              break;
            }
          }
        }
      }
    } else {
      // Rename if needed
      if (extractedEsPath !== esPath) {
        fs.copyFileSync(extractedEsPath, esPath);
      }
    }

    // Clean up ZIP file
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      log('Cleaned up ZIP file');
    }

    // Verify es.exe exists
    if (!fs.existsSync(esPath)) {
      throw new Error('es.exe not found after extraction');
    }

    const stats = fs.statSync(esPath);
    log(`es.exe size: ${(stats.size / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('Download/extract error:', errorMessage);
    throw new Error(`Failed to download es.exe: ${errorMessage}`);
  }
}

/**
 * Download a file from URL with redirect support
 */
function downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      reject(new Error('Too many redirects'));
      return;
    }

    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      log(`Download response status: ${response.statusCode}`);
      
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          log(`Following redirect to: ${redirectUrl}`);
          file.close();
          // Consume response data
          response.resume();
          // Follow redirect
          downloadFile(redirectUrl, destPath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        file.close();
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      pipelineAsync(response, file)
        .then(() => {
          log(`Downloaded ${(fs.statSync(destPath).size / 1024).toFixed(2)} KB to ${destPath}`);
          resolve();
        })
        .catch((err) => {
          file.close();
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          reject(new Error(`Failed to save file: ${err.message}`));
        });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(new Error(`Download error: ${err.message}`));
    });
  });
}

function handleDownloadResponse(
  response: IncomingMessage,
  file: fs.WriteStream,
  esPath: string,
  resolve: () => void,
  reject: (error: Error) => void
) {
  if (response.statusCode !== 200) {
    file.close();
    fs.unlinkSync(esPath);
    reject(new Error(`Failed to download es.exe: Status ${response.statusCode}`));
    return;
  }

  pipelineAsync(response, file)
    .then(() => {
      log(`Download complete: ${esPath}`);
      
      // Verify file was downloaded
      const stats = fs.statSync(esPath);
      log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      if (stats.size < 1000) {
        // File too small, likely an error page
        fs.unlinkSync(esPath);
        reject(new Error('Downloaded file too small - may be an error page'));
        return;
      }
      
      resolve();
    })
    .catch((err) => {
      log('Pipeline error:', err.message);
      file.close();
      if (fs.existsSync(esPath)) {
        fs.unlinkSync(esPath);
      }
      reject(new Error(`Failed to save es.exe: ${err.message}`));
    });
}

/**
 * Initialize es.exe - download if not present
 * Only runs on Windows
 */
export async function initializeEs(): Promise<boolean> {
  if (!isWindows()) {
    log('Skipping es.exe initialization - not on Windows');
    return false;
  }

  try {
    if (esExists()) {
      log('es.exe already exists');
      return true;
    }

    log('es.exe not found, downloading...');
    await downloadEs();
    log('es.exe downloaded successfully');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('Failed to initialize es.exe:', errorMessage);
    
    // Provide helpful error message
    if (errorMessage.includes('404')) {
      log('es.exe not found in GitHub Releases. Please download manually from: https://github.com/voidtools/ES/releases');
    } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
      log('Network error - please check your internet connection');
    }
    
    return false;
  }
}

export { getEsPath };
