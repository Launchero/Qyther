import { ipcMain } from 'electron';
import { createLogger } from '../utils/logger';

const log = createLogger('License');

// Gumroad product ID - set before building release
const GUMROAD_PRODUCT_ID = process.env.GUMROAD_PRODUCT_ID || '';

export function registerLicenseHandlers(): void {
  ipcMain.handle('license:verify', async (_, licenseKey: string) => {
    if (!GUMROAD_PRODUCT_ID) {
      log.warn('GUMROAD_PRODUCT_ID not set, allowing access');
      return { success: true };
    }

    try {
      const params = new URLSearchParams();
      params.append('product_id', GUMROAD_PRODUCT_ID);
      params.append('license_key', licenseKey);
      params.append('increment_uses_count', 'true');

      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        body: params,
      });

      if (!response.ok) {
        log.warn('License verification failed', { status: response.status });
        return { success: false, error: 'Invalid license key' };
      }

      const data = await response.json();
      
      // Skip test purchases
      if (data.purchase?.test) {
        log.info('Test purchase detected, skipping verification');
        return { success: true, purchase: data.purchase };
      }

      if (data.success && data.purchase && !data.purchase.refunded) {
        log.info('License verified successfully');
        return { success: true, purchase: data.purchase };
      }

      return { success: false, error: data.message || 'License not valid' };
    } catch (error) {
      log.error('License verification error:', error);
      return { success: false, error: 'Network error during verification' };
    }
  });
}
