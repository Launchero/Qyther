import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WindowMode } from './windowManager';


interface LLMPreferences {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  providerType?: 'openai' | 'ollama' | 'vllm' | 'lm-studio' | 'custom';
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

interface MCPPreferences {
  enabled?: boolean;
  enabledServers?: string[];
  enabledTools?: string[];
  servers?: Array<{
    name: string;
    type: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled?: boolean;
  }>;
}

interface Preferences {
  windowMode?: WindowMode;
  customDimensions?: {
    width: number;
    height: number;
  };
  lastPosition?: {
    x: number;
    y: number;
  };
  
  llm?: LLMPreferences;
  mcp?: MCPPreferences;
}

const PREFERENCES_FILE = join(app.getPath('userData'), 'preferences.json');

function getPreferencesPath(): string {
  const userDataPath = app.getPath('userData');
  
  // Ensure directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  
  return PREFERENCES_FILE;
}

export function getDefaultMCPConfig(): MCPPreferences {
  return {
    enabled: true,
    servers: [
      {
        name: 'filesystem',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
        enabled: true,
      },
      {
        name: 'time',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-time'],
        enabled: false,
      },
    ],
  };
}

export function loadPreferences(): Preferences {
  const prefsPath = getPreferencesPath();
  
  if (!existsSync(prefsPath)) {
    return {
      mcp: getDefaultMCPConfig(),
    };
  }
  
  try {
    const data = readFileSync(prefsPath, 'utf-8');
    const prefs = JSON.parse(data) as Preferences;
    
    if (!prefs.mcp) {
      prefs.mcp = getDefaultMCPConfig();
    }
    
    return prefs;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return {
      mcp: getDefaultMCPConfig(),
    };
  }
}

export function savePreferences(prefs: Partial<Preferences>): void {
  const prefsPath = getPreferencesPath();
  
  try {
    const existingPrefs = loadPreferences();
    
    const updatedPrefs = { ...existingPrefs, ...prefs };
    
    // Write to file (creates the file if it doesn't exist)
    writeFileSync(prefsPath, JSON.stringify(updatedPrefs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save preferences:', error);
    // Fallback: try to ensure directory exists and retry once
    try {
      const userDataPath = app.getPath('userData');
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
      }
      writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch (retryError) {
      console.error('Failed to save preferences on retry:', retryError);
    }
  }
}

export function initializePreferences(): void {
  try {
    // Ensure user data directory exists
    const userDataPath = app.getPath('userData');
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }
    
    // Ensure preferences file exists
    if (!existsSync(PREFERENCES_FILE)) {
      writeFileSync(PREFERENCES_FILE, '{}', 'utf-8');
    }
    
    console.log('Preferences initialized');
  } catch (error) {
    console.error('Failed to initialize preferences:', error);
  }
}

export function resetPreferences(): void {
  const prefsPath = getPreferencesPath();
  
  if (existsSync(prefsPath)) {
    try {
      writeFileSync(prefsPath, '{}', 'utf-8');
    } catch (error) {
      console.error('Failed to reset preferences:', error);
    }
  }
}
