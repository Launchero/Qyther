export type OSDisplayNames = {
  modifier: string;
  modifierLabel: string;
  alt: string;
  shift: string;
};

const MAC_DISPLAY: OSDisplayNames = {
  modifier: '\u2318',
  modifierLabel: 'Cmd',
  alt: '\u2325',
  shift: '\u21E7',
};

const NON_MAC_DISPLAY: OSDisplayNames = {
  modifier: 'Ctrl',
  modifierLabel: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
};

let cachedOS: OSDisplayNames | null = null;

export async function getOSDisplayNames(): Promise<OSDisplayNames> {
  if (cachedOS) return cachedOS;
  try {
    const isMac = await window.electronAPI.isMacOS();
    cachedOS = isMac ? MAC_DISPLAY : NON_MAC_DISPLAY;
  } catch {
    cachedOS = getOSDisplayNamesSync();
  }
  return cachedOS;
}

export function getOSDisplayNamesSync(): OSDisplayNames {
  if (typeof navigator === 'undefined') {
    return NON_MAC_DISPLAY;
  }
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return isMac ? MAC_DISPLAY : NON_MAC_DISPLAY;
}

export function usesMetaKey(): boolean {
  return getOSDisplayNamesSync().modifier === '\u2318';
}

/**
 * Generate an OS-appropriate aria-keyshortcuts value.
 * On macOS, uses 'Meta+' for the command key.
 * On Windows/Linux, uses 'Control+' for the control key.
 * 
 * Example: getAriaKeyshortcuts('Control', 'Shift', 'M')
 *   -> macOS:   'Meta+Shift+M'
 *   -> Windows: 'Control+Shift+M'
 */
export function getAriaKeyshortcuts(...keys: string[]): string {
  const modifierKey = usesMetaKey() ? 'Meta' : 'Control';

  return keys
    .map((key) => {
      if (key === 'Control') return modifierKey;
      if (key === 'Cmd') return modifierKey;
      return key;
    })
    .join('+');
}
