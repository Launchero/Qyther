import { useEffect, useState } from 'react';

// The palette's recent-files cap is user-configurable from the settings window. Reads the persisted
// limit from main and follows `settings:changed`, defaulting to 4 until it resolves.
export function useRecentFilesLimit(defaultLimit = 4): number {
  const [limit, setLimit] = useState(defaultLimit);

  useEffect(() => {
    let active = true;
    window.electronAPI.settings
      .get()
      .then((snapshot) => {
        if (active && snapshot.recentFilesLimit) setLimit(snapshot.recentFilesLimit);
      })
      .catch(() => {});
    const off = window.electronAPI.settings.onChanged((snapshot) => {
      if (active && snapshot.recentFilesLimit) setLimit(snapshot.recentFilesLimit);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  return limit;
}
