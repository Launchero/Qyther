import { desktopCapturer, screen } from 'electron';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLogger } from '../../utils/logger';
import type { MonitorCapture, ScreenshotResult } from './types';

const log = createLogger('ScreenshotCapture');

const MAX_FALLBACK_ATTEMPTS = 1;

export async function captureAllScreens(): Promise<ScreenshotResult> {
  log.debug('captureAllScreens: starting capture');
  const primaryDisplay = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  const primaryIndex = displays.findIndex(d => d.id === primaryDisplay.id);
  log.debug(`captureAllScreens: ${displays.length} display(s), primaryIndex=${primaryIndex}`);

  // Use the largest display dimensions for capture size
  const maxWidth = Math.max(...displays.map(d => d.bounds.width));
  const maxHeight = Math.max(...displays.map(d => d.bounds.height));
  log.debug(`captureAllScreens: capture size ${maxWidth}x${maxHeight}`);

  try {
    log.debug('captureAllScreens: calling desktopCapturer.getSources');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
      fetchWindowIcons: false,
    });

    if (sources.length === 0) {
      log.error('captureAllScreens: desktopCapturer returned 0 sources');
      throw new Error('No screen sources available from desktopCapturer');
    }

    const monitors: MonitorCapture[] = sources.map((source, index) => {
      const dataUrl = source.thumbnail.toDataURL();
      log.debug(`captureAllScreens: monitor ${index} (${source.name}) - ${source.thumbnail.getSize().width}x${source.thumbnail.getSize().height}, dataUrl length=${dataUrl.length}`);
      return {
        monitorIndex: index,
        dataUrl,
        width: source.thumbnail.getSize().width,
        height: source.thumbnail.getSize().height,
        name: source.name,
      };
    });

    log.debug(`captureAllScreens: captured ${monitors.length} monitors via desktopCapturer`);
    return {
      monitors,
      timestamp: Date.now(),
      primaryIndex,
    };
  } catch (error) {
    log.warn('captureAllScreens: desktopCapturer failed, falling back to PowerShell:', error instanceof Error ? error.message : 'Unknown error');
    return await fallbackPowerShellCapture(primaryIndex);
  }
}

export async function captureSingleMonitor(monitorIndex: number = 0): Promise<MonitorCapture> {
  const result = await captureAllScreens();
  const monitor = result.monitors[monitorIndex] ?? result.monitors[0];
  if (!monitor) {
    throw new Error(`Monitor index ${monitorIndex} not found (available: ${result.monitors.length})`);
  }
  return monitor;
}

async function fallbackPowerShellCapture(primaryIndex: number): Promise<ScreenshotResult> {
  for (let attempt = 0; attempt <= MAX_FALLBACK_ATTEMPTS; attempt++) {
    try {
      const tempFile = join(tmpdir(), `screenshot-${Date.now()}-${attempt}.png`);

      // Base64-encode the temp file path so it can be safely embedded in the
      // PowerShell script without any risk of quote-breaking or injection.
      const encodedPath = Buffer.from(tempFile, 'utf16le').toString('base64');

      // The script decodes the path from the embedded base64 string.
      // No user-controlled value touches the command line unescaped.
      const psScript = `
        [byte[]]$b = [Convert]::FromBase64String('${encodedPath}')
        $OutFile = [System.Text.Encoding]::Unicode.GetString($b)
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save($OutFile)
        $graphics.Dispose()
        $bitmap.Dispose()
      `;

      // Base64-encode the full script for -EncodedCommand (UTF-16 LE)
      const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

      const { spawn } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
          { timeout: 5000 },
        );
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`PowerShell exited with code ${code}`));
        });
        child.on('error', reject);
      });

      const imageBuffer = await readFile(tempFile);
      const base64 = imageBuffer.toString('base64');

      // Clean up temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup failure
      }

      const dataUrl = `data:image/png;base64,${base64}`;
      // Get dimensions from base64 PNG header (IHDR chunk at offset 16)
      const width = imageBuffer.readUInt32BE(16);
      const height = imageBuffer.readUInt32BE(20);

      log.debug(`Fallback capture via PowerShell: ${width}x${height}`);
      return {
        monitors: [{
          monitorIndex: 0,
          dataUrl,
          width,
          height,
          name: 'Screen (fallback)',
        }],
        timestamp: Date.now(),
        primaryIndex,
      };
    } catch (fallbackError) {
      log.warn(`Fallback attempt ${attempt + 1} failed:`, fallbackError instanceof Error ? fallbackError.message : 'Unknown');
      if (attempt === MAX_FALLBACK_ATTEMPTS) {
        throw new Error('All screenshot capture methods failed');
      }
    }
  }

  throw new Error('All screenshot capture methods failed');
}
