import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type { AppearanceTheme } from '../../shared/ipc/settings';

// Appearance is main-owned: `settings:get` is the source of truth, and `settings:changed` keeps the
// palette window and the settings window in step. `localStorage['app-theme']` is gone — a theme that
// only lived in one window's storage could not reach the other.
export type Theme = AppearanceTheme;

type EffectiveTheme = 'light' | 'dark';

interface ThemeContextType {
  /** The stored choice; `system` follows the OS. */
  theme: Theme;
  /** The concrete light/dark the window is painting. */
  effectiveTheme: EffectiveTheme;
  reducedMotion: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setReducedMotion: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // `system` is the default until `settings:get` resolves, so first paint follows the OS, never forces a theme.
  const [theme, setThemeState] = useState<Theme>('system');
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Seed from main and follow every push. Optimistic `setTheme`/`setReducedMotion` below is settled
  // by the matching `settings:changed` echo.
  useEffect(() => {
    let active = true;
    window.electronAPI.settings
      .get()
      .then((snap) => {
        if (!active) return;
        setThemeState(snap.theme);
        setReducedMotionState(snap.reducedMotion);
      })
      .catch(() => {});
    const off = window.electronAPI.settings.onChanged((snap) => {
      setThemeState(snap.theme);
      setReducedMotionState(snap.reducedMotion);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  // In `system` mode, follow the OS colour scheme live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: EffectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Paint the theme onto <html> (the `.dark`/`.light` class drives `@custom-variant dark`).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    root.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  // The reduced-motion override zeroes the CSS `--duration-*`/`--animate-*` tokens via
  // `html[data-reduce-motion]` (see styles/globals.css) — the renderer half of the toggle.
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) {
      root.setAttribute('data-reduce-motion', 'true');
    } else {
      root.removeAttribute('data-reduce-motion');
    }
  }, [reducedMotion]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    void window.electronAPI.settings.set({ theme: next });
  }, []);

  const setReducedMotion = useCallback((value: boolean) => {
    setReducedMotionState(value);
    void window.electronAPI.settings.set({ reducedMotion: value });
  }, []);

  // The quick palette toggle (Alt+Shift+T, footer ThemeToggle) flips between the two concrete
  // themes; the three-way `system` choice lives in the Appearance section.
  const toggleTheme = useCallback(() => {
    setTheme(effectiveTheme === 'light' ? 'dark' : 'light');
  }, [effectiveTheme, setTheme]);

  const value = useMemo(
    () => ({ theme, effectiveTheme, reducedMotion, toggleTheme, setTheme, setReducedMotion }),
    [theme, effectiveTheme, reducedMotion, toggleTheme, setTheme, setReducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
