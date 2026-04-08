import { Tray, Menu, nativeImage, app } from 'electron';
import { showMainWindow, hideMainWindow } from './windows';

let tray: Tray | null = null;

export function createTray(): void {
  // Create a simple 16x16 blue icon programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  
  // Fill with blue color (RGBA) - solid circle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const index = (y * size + x) * 4;
      
      if (dist <= size / 2 - 1) {
        // Solid blue circle
        canvas[index + 0] = 0;    // R
        canvas[index + 1] = 122;  // G
        canvas[index + 2] = 255;  // B
        canvas[index + 3] = 255;  // A
      } else if (dist <= size / 2) {
        // Anti-aliased edge
        const alpha = Math.floor(255 * (size / 2 - dist));
        canvas[index + 0] = 0;
        canvas[index + 1] = 122;
        canvas[index + 2] = 255;
        canvas[index + 3] = alpha;
      } else {
        // Transparent
        canvas[index + 3] = 0;
      }
    }
  }
  
  const trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  
  // Make sure icon is not empty
  if (trayIcon.isEmpty()) {
    console.error('Failed to create tray icon - image is empty');
    return;
  }
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Raycast Clone',
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
  
  tray.setToolTip('Raycast Clone');
  tray.setContextMenu(contextMenu);
  
  // Show/hide on double click
  tray.on('double-click', () => {
    showMainWindow();
  });
  
  // Click to show
  tray.on('click', () => {
    showMainWindow();
  });
  
  console.log('System tray created successfully with icon');
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
