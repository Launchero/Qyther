/**
 * The settings snapshot, as main publishes it.
 *
 * Appearance is main-owned: `settings:get` returns this, `settings:set` persists it, and
 * `settings:changed` pushes the new value to every open webContents so the palette window and the
 * settings window can never drift. Declaring the row shape here keeps it out of `preload.ts` and
 * the renderer, which is the drift this repo's IPC contract keeps re-growing.
 *
 * Types only: no runtime value, no Electron, so importing this from the sandboxed preload erases at
 * build and adds nothing to the bundle. The default snapshot lives in main (the source of truth),
 * not here.
 */
export type AppearanceTheme = 'light' | 'dark' | 'system';

export interface SettingsSnapshot {
  /** `system` follows the OS colour scheme; `light`/`dark` are explicit choices. */
  theme: AppearanceTheme;
  /** User override of reduced motion, applied in main (the height tween) and in the renderer (CSS). */
  reducedMotion: boolean;
  /** Cap on the recent-files list the palette remembers. */
  recentFilesLimit?: number;
}

/** The patchable subset a `settings:set` call carries; main merges it onto the stored snapshot. */
export type SettingsPatch = Partial<SettingsSnapshot>;
