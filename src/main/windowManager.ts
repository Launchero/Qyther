import { BrowserWindow, screen } from 'electron';
import { loadPreferences, savePreferences } from './preferences';
import { createLogger } from './utils/logger';

const log = createLogger('WindowMgr');

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

// Height step size and interval for animated transitions
const RESIZE_ANIMATION_STEP = 30;
const RESIZE_ANIMATION_INTERVAL_MS = 16;

class WindowManager {
  private currentMode: WindowMode = 'compact';
  private customDimensions: { width: number; height: number } | null = null;
  private isUserResizing = false;
  private resizeListenerAttached = false;
  private animationTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadSavedPreferences();
  }

  private attachResizeListener(window: BrowserWindow, configWidth: number): void {
    if (this.resizeListenerAttached) return;
    this.resizeListenerAttached = true;

    window.on('resize', () => {
      if (this.isUserResizing || this.currentMode !== 'expanded') return;
      const bounds = window.getBounds();
      if (bounds.width !== configWidth) {
        this.isUserResizing = true;
        window.setSize(configWidth, bounds.height);
        this.isUserResizing = false;
      }
    });
  }

  private loadSavedPreferences(): void {
    const prefs = loadPreferences();
    
    if (prefs.windowMode && (prefs.windowMode === 'compact' || prefs.windowMode === 'expanded' || prefs.windowMode === 'custom')) {
      this.currentMode = prefs.windowMode;
    } else {
      this.currentMode = 'compact';
    }
    
    // Only load custom dimensions if mode is actually 'custom'
    if (prefs.windowMode === 'custom' && prefs.customDimensions) {
      this.customDimensions = prefs.customDimensions;
    } else if (prefs.customDimensions) {
      log.debug('Clearing stale custom dimensions from preferences');
      savePreferences({ customDimensions: undefined });
    }
  }

  public getCurrentMode(): WindowMode {
    return this.currentMode;
  }

  public setMode(mode: WindowMode, window?: BrowserWindow): void {
    // If already in this mode and it's expanded, don't reset size (user may have resized)
    if (mode === this.currentMode && mode === 'expanded') {
      return;
    }
    
    this.currentMode = mode;
    
    // Clear custom dimensions when switching to default modes
    if (mode !== 'custom') {
      this.customDimensions = null;
    }
    
    savePreferences({ windowMode: mode });
    
    if (window && MODE_CONFIGS[mode]) {
      const config = MODE_CONFIGS[mode];
      log.info('Setting window mode:', mode, `${config.width}x${config.height}`);
      
      // Tell renderer to update layout for the new mode
      window.webContents.send('window:modeChanged', mode);
      
      if (mode === 'expanded') {
        const defaultHeight = config.height;
        window.setResizable(true);
        window.setMinimumSize(config.width, Math.max(300, defaultHeight * 0.5));
        
        // Cap height to available work area below the window top position
        const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const { y: windowY } = this.calculateWindowPosition(window);
        const maxAvailableHeight = currentScreen.workAreaSize.height - (windowY - currentScreen.bounds.y);
        const effectiveHeight = Math.min(defaultHeight, maxAvailableHeight);
        const cappedMaxHeight = Math.min(1080, maxAvailableHeight);
        window.setMaximumSize(config.width, cappedMaxHeight);
        
        // Animate from current height to target height
        const currentBounds = window.getBounds();
        const startHeight = currentBounds.height;
        this.animateWindowHeight(window, startHeight, effectiveHeight, () => {
          this.repositionWindow(window);
          this.attachResizeListener(window, config.width);
        });
      } else {
        // For compact/custom modes, lock to fixed size
        window.setResizable(true);
        window.setMinimumSize(100, 100);
        window.setMaximumSize(1920, 1080);
        
        // Animate from current height to target height
        const currentBounds = window.getBounds();
        const startHeight = currentBounds.height;
        this.animateWindowHeight(window, startHeight, config.height, () => {
          this.repositionWindow(window);
          // Lock dimensions after animation completes
          window.setMinimumSize(config.width, config.height);
          window.setMaximumSize(config.width, config.height);
          window.setResizable(false);
        log.debug('Window locked at', `${config.width}x${config.height}`);
        });
      }
    }
  }

  private animateWindowHeight(
    window: BrowserWindow,
    fromHeight: number,
    toHeight: number,
    onComplete?: () => void,
  ): void {
    // Cancel any ongoing animation
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }

    // If the height difference is small, jump directly
    if (Math.abs(toHeight - fromHeight) < RESIZE_ANIMATION_STEP) {
      window.setBounds({ height: toHeight });
      onComplete?.();
      return;
    }

    let currentHeight = fromHeight;
    const direction = toHeight > fromHeight ? 1 : -1;

    this.animationTimer = setInterval(() => {
      const remaining = Math.abs(toHeight - currentHeight);
      if (remaining <= RESIZE_ANIMATION_STEP) {
        currentHeight = toHeight;
        window.setBounds({ height: currentHeight });
        if (this.animationTimer) {
          clearInterval(this.animationTimer);
          this.animationTimer = null;
        }
        onComplete?.();
        return;
      }

      currentHeight += RESIZE_ANIMATION_STEP * direction;
      window.setBounds({ height: currentHeight });
    }, RESIZE_ANIMATION_INTERVAL_MS);
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
    const { width: screenWidth } = currentScreen.workAreaSize;
    const { width: windowWidth } = config;

    const x = Math.floor((screenWidth - windowWidth) / 2 + currentScreen.bounds.x);
    
    // Keep consistent top position for both modes (expand downward only)
    const y = Math.floor(currentScreen.workAreaSize.height * 0.15 + currentScreen.bounds.y);

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
