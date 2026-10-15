import { ipcMain, app, safeStorage } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createLogger } from '../utils/logger';
import { checkBaseUrl } from './api-config-guard';

const log = createLogger('ApiConfig');

interface EncryptedApiConfig {
  baseUrl: string;
  model: string;
  apiKeyEncrypted: Buffer | null;
}

interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const CONFIG_PATH = join(app.getPath('userData'), 'api-config.json');

function encryptApiKey(apiKey: string): Buffer | null {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(apiKey);
    }
    log.warn('Encryption not available, falling back to plaintext');
    return null;
  } catch (err) {
    log.error('Failed to encrypt API key:', err);
    return null;
  }
}

function decryptApiKey(encrypted: Buffer | null): string | null {
  try {
    if (!encrypted) return null;
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encrypted);
    }
    log.warn('Encryption not available');
    return null;
  } catch (err) {
    log.error('Failed to decrypt API key:', err);
    return null;
  }
}

function loadConfig(): { config: ApiConfig | null; needsMigration: boolean } {
  try {
    if (!existsSync(CONFIG_PATH)) return { config: null, needsMigration: false };
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    // Check if this is the new encrypted format
    if ('apiKeyEncrypted' in parsed) {
      const encrypted = parsed as EncryptedApiConfig;
      const apiKey = decryptApiKey(encrypted.apiKeyEncrypted);
      if (apiKey) {
        return { config: { apiKey, baseUrl: encrypted.baseUrl, model: encrypted.model }, needsMigration: false };
      }
      // Decryption failed - config is corrupted
      log.error('Failed to decrypt API key, config may be corrupted');
      return { config: null, needsMigration: false };
    }

    // Legacy plaintext format - needs migration
    if ('apiKey' in parsed) {
      log.info('Migrating API config from plaintext to encrypted format');
      return { config: parsed as ApiConfig, needsMigration: true };
    }

    return { config: null, needsMigration: false };
  } catch (err) {
    log.error('Failed to load API config:', err);
    return { config: null, needsMigration: false };
  }
}

function saveEncryptedConfig(config: ApiConfig): boolean {
  try {
    const encrypted: EncryptedApiConfig = {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyEncrypted: encryptApiKey(config.apiKey),
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(encrypted, (_, value) =>
      value instanceof Buffer ? value.toString('base64') : value
    , 2), 'utf-8');
    return true;
  } catch (err) {
    log.error('Failed to save API config:', err);
    return false;
  }
}

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

async function testApiConnection(config: ApiConfig): Promise<{ success: boolean; error?: string }> {
  // Checked here, in main, rather than in preload: preload is renderer-reachable, so a guard there
  // is not a boundary. Nothing is fetched and no key is put on the wire until the URL passes.
  const checked = checkBaseUrl(config?.baseUrl);
  if (!checked.ok) {
    log.warn('Rejected api-config:test baseUrl:', checked.reason);
    return { success: false, error: checked.reason };
  }

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      log.warn('API test failed', { status: response.status, body: errorBody.substring(0, 200) });
      return { success: false, error: `API returned ${response.status}: ${errorBody.substring(0, 100)}` };
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return { success: true };
    }
    return { success: false, error: 'API returned empty response' };
  } catch (error) {
    log.error('API test connection error:', error);
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export function registerApiConfigHandlers(): void {
  ipcMain.handle('api-config:save', async (_, config: ApiConfig) => {
    // The stored baseUrl is what every later chat request hits, with the real key attached, so a
    // rejected URL has to be rejected before it is persisted — not only at test time.
    const checked = checkBaseUrl(config?.baseUrl);
    if (!checked.ok) {
      log.warn('Rejected api-config:save baseUrl:', checked.reason);
      return { success: false, error: checked.reason };
    }

    const saved = saveEncryptedConfig(config);
    if (saved) {
      log.info('API config saved (encrypted)');
      return { success: true };
    }
    log.error('Failed to save API config');
    return { success: false, error: 'Failed to save configuration' };
  });

  ipcMain.handle('api-config:load', async () => {
    const { config, needsMigration } = loadConfig();
    if (!config) return { configured: false };

    // Migrate plaintext config to encrypted format
    if (needsMigration) {
      saveEncryptedConfig(config);
    }

    return {
      configured: true,
      baseUrl: config.baseUrl,
      model: config.model,
      maskedKey: maskKey(config.apiKey),
    };
  });

  ipcMain.handle('api-config:delete', async () => {
    try {
      if (existsSync(CONFIG_PATH)) {
        unlinkSync(CONFIG_PATH);
      }
      log.info('API config deleted');
      return { success: true };
    } catch (err) {
      log.error('Failed to delete API config:', err);
      return { success: false, error: 'Failed to delete configuration' };
    }
  });

  ipcMain.handle('api-config:test', async (_, config: ApiConfig) => {
    return testApiConnection(config);
  });
}
