import { useCallback, useEffect, useState } from 'react';
import type { SettingsSnapshot, SettingsPatch } from '../../../shared/ipc/settings';

/**
 * The renderer's read/write view of main-owned settings. Seeds from `settings:get` on mount and
 * follows every `settings:changed` push, so a control here stays in step with the palette window.
 */
export function useSettings() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    window.electronAPI.settings
      .get()
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch(() => {});
    const off = window.electronAPI.settings.onChanged((s) => {
      if (active) setSnapshot(s);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  const set = useCallback((patch: SettingsPatch) => {
    void window.electronAPI.settings.set(patch);
  }, []);

  return { snapshot, set };
}
