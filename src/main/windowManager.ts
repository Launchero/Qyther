import { BrowserWindow, screen } from 'electron';
import { loadPreferences, savePreferences } from './preferences';

export type WindowMode = 'compact' | 'expanded' | 'custom';

export interface WindowModeConfig {
  mode: WindowMode;
  width: number;
  height: number;
  positionY?: 'top' | 'center' | 'custom';
  customX?: number;
  customY?: number;
}

// Default mode configurations
const MODE_CONFIGS: Record<WindowMode, { width: number; height: number; positionY: 'top' | 'center' }> = {
  compact: {
    width: 800,
    height: 100,
    positionY: 'top',
  },
  expanded: {
    width: 800,
    height: 600,
    positionY: 'center',
  },
  custom: {
    width: 800,
    height: 480,
    positionY: 'top',
  },
};

class WindowManager {
  private currentMode: WindowMode = 'expanded';
  private customDimensions: { width: number; height: number } | null = null;

  constructor() {
    this.loadSavedPreferences();
  }

  private loadSavedPreferences(): void {
    const prefs = loadPreferences();
    if (prefs.windowMode) {
      this.currentMode = prefs.windowMode;
    }
    // Only load custom dimensions if mode is actually 'custom'
    if (prefs.windowMode === 'custom' && prefs.customDimensions) {
      this.customDimensions = prefs.customDimensions;
    } else if (prefs.customDimensions) {
      // Clear stale custom dimensions from preferences to prevent conflicts
      console.log('[WindowManager] Clearing stale custom dimensions from preferences');
      savePreferences({ customDimensions: undefined });
    }
  }

  public getCurrentMode(): WindowMode {
    return this.currentMode;
  }

  public setMode(mode: WindowMode, window?: BrowserWindow): void {
    this.currentMode = mode;
    
    // Clear custom dimensions when switching to default modes
    if (mode !== 'custom') {
      this.customDimensions = null;
    }
    
    savePreferences({ windowMode: mode });
    
    if (window && MODE_CONFIGS[mode]) {
      const config = MODE_CONFIGS[mode];
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 🪟 Setting window mode: ${mode} (${config.width}x${config.height})`);
      
      // Tell renderer to update layout for the new mode
      window.webContents.send('window:modeChanged', mode);
      
      // Enable resizing
      window.setResizable(true);
      window.setMinimumSize(100, 100);
      window.setMaximumSize(1920, 1080);
      
      // Set new size and position
      window.setSize(config.width, config.height);
      this.repositionWindow(window);
      
      // Lock to new size after a short delay to allow renderer to update
      setTimeout(() => {
        window.setMinimumSize(config.width, config.height);
        window.setMaximumSize(config.width, config.height);
        window.setResizable(false);
        const lockTime = new Date().toLocaleTimeString();
        console.log(`[${lockTime}] 🔒 Window locked at ${config.width}x${config.height}`);
      }, 150);
    }
  }

  public toggleMode(window?: BrowserWindow): WindowMode {
    const newMode = this.currentMode === 'compact' ? 'expanded' : 'compact';
    this.setMode(newMode, window);
    return newMode;
  }

  public setCustomDimensions(width: number, height: number, window?: BrowserWindow): void {
    this.customDimensions = { width, height };
    this.currentMode = 'custom';
    savePreferences({ 
      windowMode: 'custom',
      customDimensions: { width, height }
    });
    
    if (window) {
      // Temporarily enable resizing to allow setSize to work
      window.setResizable(true);
      window.setSize(width, height);
      // Disable resizing again to maintain launcher behavior
      window.setResizable(false);
      this.repositionWindow(window);
    }
  }

  public getModeConfig(mode?: WindowMode): WindowModeConfig {
    const targetMode = mode || this.currentMode;
    const config = MODE_CONFIGS[targetMode];
    
    if (targetMode === 'custom' && this.customDimensions) {
      return {
        mode: 'custom',
        width: this.customDimensions.width,
        height: this.customDimensions.height,
        positionY: config?.positionY || 'top',
      };
    }
    
    return {
      mode: targetMode,
      width: config?.width || MODE_CONFIGS.expanded.width,
      height: config?.height || MODE_CONFIGS.expanded.height,
      positionY: config?.positionY || 'center',
    };
  }

  public calculateWindowPosition(_window: BrowserWindow): { x: number; y: number } {
    const config = this.getModeConfig();
    const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;
    const { width: windowWidth } = config;

    const x = Math.floor((screenWidth - windowWidth) / 2 + currentScreen.bounds.x);
    
    // Keep consistent top position for both modes (expand downward only)
    const y = Math.floor(screenHeight * 0.15 + currentScreen.bounds.y); // 15% from top

    return { x, y };
  }

  public repositionWindow(window: BrowserWindow): void {
    const { x, y } = this.calculateWindowPosition(window);
    window.setPosition(x, y);
  }

  public applyModeToWindow(window: BrowserWindow): void {
    const config = this.getModeConfig();
    // Temporarily enable resizing to allow setSize to work
    window.setResizable(true);
    window.setSize(config.width, config.height);
    // Disable resizing again to maintain launcher behavior
    window.setResizable(false);
    this.repositionWindow(window);
  }
}

// Singleton instance
export const windowManager = new WindowManager();
