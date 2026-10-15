import { useEffect } from 'react';
import { safeExternalUrl } from '@/utils/externalUrl';
import { logError } from '@/utils/debugLogger';

/**
 * The host window denies new windows and blocks navigation, so a plain `<a href>` is a
 * dead click. Route every http(s) anchor to the OS browser through `url:open`, which
 * re-validates the scheme in main. Non-http schemes never reach the bridge.
 */
export function useExternalLinkHandler(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a');
      const href = safeExternalUrl(anchor?.getAttribute('href'));
      if (!href) return;
      event.preventDefault();
      window.electronAPI.url.open(href).catch((err) => logError('[useExternalLinkHandler] url:open failed:', err));
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
}
