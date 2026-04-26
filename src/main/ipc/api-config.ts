import { ipcMain, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createLogger } from '../utils/logger';

const log = createLogger('ApiConfig');

interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const CONFIG_PATH = join(app.getPath('userData'), 'api-config.json');

function loadConfig(): ApiConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as ApiConfig;
  } catch (err) {
    log.error('Failed to load API config:', err);
    return null;
  }
}

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

async function testApiConnection(config: ApiConfig): Promise<{ success: boolean; error?: string }> {
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
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      log.info('API config saved');
      return { success: true };
    } catch (err) {
      log.error('Failed to save API config:', err);
      return { success: false, error: 'Failed to save configuration' };
    }
  });

  ipcMain.handle('api-config:load', async () => {
    const config = loadConfig();
    if (!config) return { configured: false };
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
