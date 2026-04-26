import { Tray, Menu, nativeImage, app } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { showMainWindow, hideMainWindow } from './windows';
import { createLogger } from './utils/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('Tray');

let tray: Tray | null = null;

export function createTray(): void {
  // Load tray icon from public directory (copied to out/renderer in dev)
  // or from app resources in production
  const isDev = process.env.DEV === 'true' || process.env.NODE_ENV === 'development';
  const iconDir = isDev 
    ? join(__dirname, '../../public') 
    : join(process.resourcesPath, 'icons');
  
  // Use PNG for tray icon
  const trayIconPath = isDev
    ? join(__dirname, '../../build/icons/icon-256.png')
    : join(iconDir, 'icon.ico');
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  
  // Make sure icon is not empty
  if (trayIcon.isEmpty()) {
    log.error('Failed to create tray icon - image is empty');
    return;
  }
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Qyther',
      click: () => {
        showMainWindow();
      },
    },
    {
      label: 'Hide Window',
      click: () => {
        hideMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
  
  tray.setToolTip('Qyther');
  tray.setContextMenu(contextMenu);
  
  // Show/hide on double click
  tray.on('double-click', () => {
    showMainWindow();
  });
  
  // Click to show
  tray.on('click', () => {
    showMainWindow();
  });
  
  log.info('System tray created successfully with icon');
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
