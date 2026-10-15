import { BrowserWindow, screen } from 'electron';
import { loadPreferences, savePreferences } from './preferences';
import { prefersWindowAnimation } from './utils/platform';
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
    height: 72,
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

// The mode change is a height tween over a fixed time, not a fixed pixel step per tick: a
// 30px/16ms loop made the duration a function of the distance (100 -> 600px took ~272ms) and
// landed linearly, which reads as a snap rather than a transition.
const MODE_HEIGHT_TWEEN_MS = 180;
/**
 * How long a tween may go without a frame report before it is abandoned and snapped. The clock
 * is the page's `requestAnimationFrame` (`hooks/useWindowTween.ts`), which is throttled to a
 * stop while the window is hidden or occluded — snapping there is invisible, and it keeps the
 * geometry from being left at a mid-tween height.
 */
const TWEEN_STALL_SNAP_MS = 120;

/**
 * Bounds that make any height this app ever uses legal, applied *before* a height tween and
 * tightened when it lands. Both modes lock the window to their own size with
 * `setMinimumSize`/`setMaximumSize`, and Windows honours a new minimum by resizing the window
 * immediately — so applying the expanded floor (≈301 px) while the palette was locked at 103 px
 * snapped it ~200 px down the screen in one frame before the tween had even read its start
 * height. The page-frame trace measured 103 → 479 as the first two samples.
 */
const TWEEN_MIN_BOUNDS = { width: 100, height: 72 }; // height must stay ≤ the smallest mode height (compact); a raised minimum resizes the window at once
const TWEEN_MAX_BOUNDS = { width: 1920, height: 1080 };

/**
 * Smoothstep: zero velocity at both ends, peaking at 1.5× the average in the middle.
 *
 * This was `easeOutCubic`, whose velocity is maximal at `t = 0` — three times the average, so the
 * first presented frame of a 100 → 600 px expand moved the window ~135 px in one go. That reads as
 * a snap with a slide behind it, which is the complaint this whole change answers. An ease-in also
 * keeps the tween honest under a jittery clock: when the page's first report arrives late, the
 * curve has not already spent most of its distance.
 */
function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

// Geometry helpers. `bounds` and `workArea` disagree as soon as the taskbar is docked top or
// left, so the origin, the centring and the available-height cap all come from `workArea`.

/** The palette's top edge sits this far below the work-area top; modes expand downward only. */
const PALETTE_TOP_OFFSET_RATIO = 0.15;

/** Ceiling on the expanded palette's height, independent of how tall the display is. */
const EXPANDED_MAX_HEIGHT = 1080;

/** Floor on the expanded palette's height, so a drag cannot shrink it into an unusable strip. */
const EXPANDED_MIN_HEIGHT = 300;

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The display under the cursor minus any docked taskbar — the only frame the palette may use. */
function getWorkArea(): WorkArea {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

/** The fixed top edge, measured from the work area so a top-docked taskbar never overlaps it. */
function getWorkAreaTop(workArea: WorkArea): number {
  return Math.floor(workArea.y + workArea.height * PALETTE_TOP_OFFSET_RATIO);
}

/** Space left under the fixed top edge — the cap on any requested height. */
function getAvailableHeight(workArea: WorkArea): number {
  return Math.max(1, workArea.height - (getWorkAreaTop(workArea) - workArea.y));
}

/** Fit a requested size into the work area so the window can never bleed off-screen. */
function clampSizeToWorkArea(
  width: number,
  height: number,
  workArea: WorkArea,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.min(width, workArea.width)),
    height: Math.max(1, Math.min(height, getAvailableHeight(workArea))),
  };
}

/**
 * Where the palette goes and how big it may be on the display under the cursor: horizontally
 * centred inside `workArea`, anchored to its fixed top edge, clamped so it always fits.
 */
export function getPaletteLayout(width: number, height: number): WorkArea {
  const workArea = getWorkArea();
  const size = clampSizeToWorkArea(width, height, workArea);
  return {
    x: Math.floor(workArea.x + (workArea.width - size.width) / 2),
    y: getWorkAreaTop(workArea),
    width: size.width,
    height: size.height,
  };
}

/**
 * One in-flight height tween. The page's `requestAnimationFrame` is the clock (`hooks/useWindowTween.ts`):
 * main writes at most one height per reported frame, so the two advance in step instead of main
 * racing a compositor it cannot see.
 */
interface HeightTween {
  window: BrowserWindow;
  mode: WindowMode;
  fromHeight: number;
  toHeight: number;
  startedAt: number;
  lastHeight: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  onComplete?: () => void;
}

class WindowManager {
  private currentMode: WindowMode = 'compact';
  private customDimensions: { width: number; height: number } | null = null;
  private isUserResizing = false;
  /**
   * Which window the width-lock listener is attached to — deliberately not a boolean. A one-way
   * latch means the first window to exist claims it forever, so a palette window recreated later
   * (`main.ts` recreates on `activate`) would never get the listener, and nothing would pull its
   * width back when the user dragged it sideways.
   */
  private resizeListenerWindow: BrowserWindow | null = null;
  private heightTween: HeightTween | null = null;

  constructor() {
    this.loadSavedPreferences();
  }

  private attachResizeListener(window: BrowserWindow, configWidth: number): void {
    if (this.resizeListenerWindow === window) return;
    this.resizeListenerWindow = window;

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
      if (window) {
        this.applyModeConstraints(window, mode);
        // Still acknowledge, or a renderer that asked for this mode never hears back.
        this.emitModeSettled(window, mode);
      }
      return;
    }

    this.currentMode = mode;

    // Clear custom dimensions when switching to default modes
    if (mode !== 'custom') {
      this.customDimensions = null;
    }

    savePreferences({ windowMode: mode });

    if (!window) return;

    // `getModeConfig` is the accessor that honours persisted `customDimensions`, and the size
    // it returns is already clamped into the current work area.
    const config = this.getModeConfig(mode);
    log.info('Setting window mode:', mode, `${config.width}x${config.height}`);

    // Tell renderer to update layout for the new mode
    window.webContents.send('window:modeChanged', mode);

    if (mode === 'expanded') {
      // Loosen the lock first, without moving the window, so the expanded floor cannot snap it
      // before the animation starts. The real bounds go on in the completion callback.
      this.beginTweenBounds(window, config.width);
      // Animate from current height to target height
      const startHeight = window.getBounds().height;
      this.animateWindowHeight(window, mode, startHeight, config.height, () => {
        this.applyModeConstraints(window, mode);
        this.repositionWindow(window);
      });
    } else {
      // For compact/custom modes, lock to fixed size
      this.applyLockedModeSize(window, config);
    }
  }

  /**
   * Make the window's *current* height legal for a tween in either direction, without changing
   * its size. The width stays locked because `attachResizeListener` restores it on any drag.
   */
  private beginTweenBounds(window: BrowserWindow, lockedWidth: number): void {
    window.setResizable(true);
    window.setMinimumSize(TWEEN_MIN_BOUNDS.width, TWEEN_MIN_BOUNDS.height);
    window.setMaximumSize(TWEEN_MAX_BOUNDS.width, TWEEN_MAX_BOUNDS.height);
    this.attachResizeListener(window, lockedWidth);
  }

  /**
   * The `expanded` constraints — resizable flag, min/max bounds and the width-lock listener —
   * applied without touching the current height. A session restored into `expanded` from
   * preferences never runs the sizing branch of `setMode`, so it needs this on its own, and the
   * tween path applies it only once the height has actually arrived.
   */
  public applyModeConstraints(window: BrowserWindow, mode: WindowMode = this.currentMode): void {
    if (mode !== 'expanded') return;

    const config = this.getModeConfig(mode);
    const { minHeight, maxHeight } = this.expandedHeightBounds();

    window.setResizable(true);
    window.setMinimumSize(config.width, minHeight);
    window.setMaximumSize(config.width, maxHeight);
    this.attachResizeListener(window, config.width);
  }

  /**
   * The expanded window's height floor and ceiling in DIPs on the current display. Exactly one
   * definition: `applyModeConstraints` sets these on the native window and `clampExpandedHeight`
   * validates a renderer's request against them, so a height can never pass the IPC handler and
   * then be silently eaten by the OS limit.
   */
  public expandedHeightBounds(): { minHeight: number; maxHeight: number } {
    const config = this.getModeConfig('expanded');
    const maxHeight = Math.min(EXPANDED_MAX_HEIGHT, getAvailableHeight(getWorkArea()));
    // Keep the floor under the ceiling, otherwise a small display gets unsatisfiable bounds.
    const minHeight = Math.min(Math.max(EXPANDED_MIN_HEIGHT, config.height * 0.5), maxHeight);
    return { minHeight, maxHeight };
  }

  /**
   * A renderer-requested height, fitted to what the expanded window may hold, or `null` when the
   * request is not a usable number. `window:resizeHeight` used to pass `Math.round(height)`
   * straight into `setBounds`, so the renderer could size the palette past the work area, past the
   * expanded ceiling, or to `NaN` — the plan's "arbitrary bounds that bypass `getPaletteLayout`"
   * hole, and the one resize path a compromised palette could reach.
   */
  public clampExpandedHeight(height: unknown): number | null {
    if (typeof height !== 'number' || !Number.isFinite(height)) return null;
    const { minHeight, maxHeight } = this.expandedHeightBounds();
    return Math.min(maxHeight, Math.max(minHeight, Math.round(height)));
  }

  /** Animate to a compact/custom height, then hard-lock the window at that size. */
  private applyLockedModeSize(window: BrowserWindow, config: WindowModeConfig): void {
    // Widen the bounds first so the animation is not clamped away by a previous lock.
    window.setResizable(true);
    window.setMinimumSize(TWEEN_MIN_BOUNDS.width, TWEEN_MIN_BOUNDS.height);
    window.setMaximumSize(TWEEN_MAX_BOUNDS.width, TWEEN_MAX_BOUNDS.height);

    const startHeight = window.getBounds().height;
    this.animateWindowHeight(window, config.mode, startHeight, config.height, () => {
      this.repositionWindow(window);
      // Lock dimensions after animation completes
      window.setMinimumSize(config.width, config.height);
      window.setMaximumSize(config.width, config.height);
      window.setResizable(false);
      log.debug('Window locked at', `${config.width}x${config.height}`);
    });
  }

  /**
   * Announce that the geometry behind a mode actually holds. `window:modeChanged` is emitted
   * before the tween starts so the renderer can lay out early; this is the matching signal that
   * the window is now at its target height, measured rather than requested. A harness waiting on
   * the tween previously polled `innerHeight` every 150 ms and compared against a ±6 px tolerance,
   * which cannot resolve a 180 ms transition at all.
   */
  private emitModeSettled(window: BrowserWindow, mode: WindowMode): void {
    if (window.isDestroyed()) return;
    window.webContents.send('window:modeSettled', {
      mode,
      height: window.getBounds().height,
    });
  }

  private animateWindowHeight(
    window: BrowserWindow,
    mode: WindowMode,
    fromHeight: number,
    toHeight: number,
    onComplete?: () => void,
  ): void {
    this.cancelHeightTween();

    // A distance too small to see lands in one frame rather than stuttering through a tween.
    if (!prefersWindowAnimation() || Math.abs(toHeight - fromHeight) < 2) {
      window.setBounds({ height: toHeight });
      onComplete?.();
      this.emitModeSettled(window, mode);
      return;
    }

    // Nothing is written here. The first reported frame produces the first step, so the whole
    // curve is walked at the page's own cadence.
    const tween: HeightTween = {
      window,
      mode,
      fromHeight,
      toHeight,
      startedAt: performance.now(),
      lastHeight: Math.round(fromHeight),
      idleTimer: null,
      onComplete,
    };
    this.heightTween = tween;
    this.armIdleTimer(tween);
  }

  /**
   * One reported page frame of an in-flight height tween. The tween advances only here: main's
   * own 16 ms timer shares no phase with the compositor, so it sometimes wrote twice inside one
   * presented frame and sometimes missed that frame's layout deadline — the harness measured 6
   * duplicate heights per transition. One step per frame is the smoothest a window resize can be,
   * and the curve stays time-based, so a dropped frame costs a step rather than a lurch.
   */
  public onAnimationFrame(): void {
    const tween = this.heightTween;
    if (!tween) return;
    this.armIdleTimer(tween);

    const progress = Math.min(1, (performance.now() - tween.startedAt) / MODE_HEIGHT_TWEEN_MS);
    // Height only: the palette's top edge is fixed, so it grows downward and is never re-centred
    // out from under itself the way a step loop that repositions at the end does.
    const height = Math.round(
      tween.fromHeight + (tween.toHeight - tween.fromHeight) * easeInOutCubic(progress),
    );

    if (progress < 1) {
      // Skip the write when the rounded height has not moved: writing the height the window
      // already has is a wasted compositor frame on a transparent, always-on-top surface.
      if (height !== tween.lastHeight) {
        tween.lastHeight = height;
        tween.window.setBounds({ height });
      }
      return;
    }
    this.finishTween(tween);
  }

  /**
   * Land the target height and announce it. Also the idle path: when no frame is reported (the
   * window was hidden or occluded mid-transition, so rAF is throttled) the tween must not leave
   * the palette stranded at an intermediate height.
   */
  private finishTween(tween: HeightTween): void {
    if (this.heightTween !== tween) return;
    this.clearIdleTimer(tween);
    this.heightTween = null;
    if (tween.window.isDestroyed()) return;
    // One terminal write, only if easing did not already land exactly on the target, so the
    // completion lock in `applyLockedModeSize` cannot disagree with the final eased value.
    if (tween.lastHeight !== tween.toHeight) {
      tween.lastHeight = tween.toHeight;
      tween.window.setBounds({ height: tween.toHeight });
    }
    tween.onComplete?.();
    this.emitModeSettled(tween.window, tween.mode);
  }

  private armIdleTimer(tween: HeightTween): void {
    this.clearIdleTimer(tween);
    tween.idleTimer = setTimeout(() => {
      tween.idleTimer = null;
      log.debug('Height tween got no frame reports; snapping to', tween.toHeight);
      this.finishTween(tween);
    }, TWEEN_STALL_SNAP_MS);
  }

  private clearIdleTimer(tween: HeightTween): void {
    if (tween.idleTimer) {
      clearTimeout(tween.idleTimer);
      tween.idleTimer = null;
    }
  }

  private cancelHeightTween(): void {
    const tween = this.heightTween;
    if (!tween) return;
    // Abandoned, not finished: a mode change mid-flight stops the old window where it is rather
    // than keeping it growing behind the new mode.
    this.clearIdleTimer(tween);
    this.heightTween = null;
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
      // Store what the user asked for, but only ever show what fits the current display.
      const size = clampSizeToWorkArea(width, height, getWorkArea());
      // Temporarily enable resizing to allow setSize to work
      window.setResizable(true);
      window.setSize(size.width, size.height);
      // Disable resizing again to maintain launcher behavior
      window.setResizable(false);
      this.repositionWindow(window);
    }
  }

  public getModeConfig(mode?: WindowMode): WindowModeConfig {
    const targetMode = mode || this.currentMode;
    const config = MODE_CONFIGS[targetMode];
    const workArea = getWorkArea();

    if (targetMode === 'custom' && this.customDimensions) {
      const size = clampSizeToWorkArea(
        this.customDimensions.width,
        this.customDimensions.height,
        workArea,
      );
      return {
        mode: 'custom',
        width: size.width,
        height: size.height,
        positionY: config?.positionY || 'top',
      };
    }

    const size = clampSizeToWorkArea(
      config?.width || MODE_CONFIGS.expanded.width,
      config?.height || MODE_CONFIGS.expanded.height,
      workArea,
    );

    return {
      mode: targetMode,
      width: size.width,
      height: size.height,
      positionY: config?.positionY || 'center',
    };
  }

  public calculateWindowPosition(_window: BrowserWindow): { x: number; y: number } {
    // Centring, the fixed top edge and the work-area clamp all live in `getPaletteLayout`,
    // the same source `windows.ts` uses at spawn — the two must never disagree.
    const config = this.getModeConfig();
    const { x, y } = getPaletteLayout(config.width, config.height);

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
