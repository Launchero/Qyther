import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * OpenCode SDK Configuration
 */
export interface OpenCodeConfig {
  baseUrl: string;
  enabled: boolean;
  model: string;
  mcpServers: MCPServerConfig[];
  tools: ToolConfig;
  sessionPersistence: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled: boolean;
  headers?: Record<string, string>;
}

export interface ToolConfig {
  bash: boolean;
  edit: boolean;
  webfetch: boolean;
  websearch: boolean;
  lsp: boolean;
}

interface OpenCodeJSON {
  model?: string;
  provider?: Record<string, any>;
  mcp?: Record<string, any>;
  tools?: Record<string, boolean>;
  permission?: Record<string, any>;
}

// Global client instance
let opencodeClient: any = null;
let isInitialized = false;

/**
 * Get the default config path
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'opencode.json');
}

/**
 * Get project-level config path
 */
function getProjectConfigPath(): string {
  const projectRoot = app.getAppPath();
  return path.join(projectRoot, 'opencode.json');
}

/**
 * Load OpenCode configuration from file
 */
export async function loadOpenCodeConfig(): Promise<OpenCodeConfig> {
  const defaultConfig: OpenCodeConfig = {
    baseUrl: process.env.OPENCODE_BASE_URL || 'http://localhost:4098',
    enabled: process.env.OPENCODE_ENABLED !== 'false',
    model: process.env.OPENCODE_MODEL || 'openai/gpt-4o',
    mcpServers: [],
    tools: {
      bash: true,
      edit: true,
      webfetch: true,
      websearch: true,
      lsp: true,
    },
    sessionPersistence: process.env.OPENCODE_SESSION_PERSISTENCE === 'true',
  };

  // Try to load from project config first, then user config
  const projectConfigPath = getProjectConfigPath();
  const userConfigPath = getConfigPath();

  try {
    const configPath = await fs.access(projectConfigPath).then(() => projectConfigPath)
      .catch(() => userConfigPath);

    const configContent = await fs.readFile(configPath, 'utf-8');
    const configJson: OpenCodeJSON = JSON.parse(configContent);

    // Parse MCP servers from config
    const mcpServers: MCPServerConfig[] = [];

    if (configJson.mcp) {
      for (const [name, serverConfig] of Object.entries(configJson.mcp)) {
        const sc = serverConfig as any;
        mcpServers.push({
          id: name,
          name: name,
          type: sc.type || 'local',
          command: sc.command,
          url: sc.url,
          enabled: sc.enabled !== false,
          headers: sc.headers,
        });
      }
    }

    return {
      ...defaultConfig,
      model: configJson.model || defaultConfig.model,
      mcpServers,
      tools: {
        ...defaultConfig.tools,
        ...configJson.tools,
      },
    };
  } catch (error) {
    // Config file doesn't exist, use defaults
    console.log('[OpenCode] Using default configuration');
    return defaultConfig;
  }
}

/**
 * Get OpenCode configuration status
 */
export async function getConfigStatus(): Promise<{ configured: boolean; hasApiKey: boolean; model: string }> {
  const config = await loadOpenCodeConfig();
  const hasApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.ALIBABA_CLOUD_API_KEY;
  return {
    configured: config.enabled && !!hasApiKey,
    hasApiKey: !!hasApiKey,
    model: config.model,
  };
}

/**
 * Initialize OpenCode client
 * Note: The actual SDK client connection would be handled via IPC to a separate OpenCode server
 * For now, we configure the settings and let the renderer communicate with the OpenCode server
 */
export async function initializeOpenCode(config?: Partial<OpenCodeConfig>): Promise<{ success: boolean; error?: string }> {
  if (isInitialized) {
    console.log('[OpenCode] Already initialized');
    return { success: true };
  }

  try {
    const mergedConfig = await loadOpenCodeConfig();
    if (config) {
      Object.assign(mergedConfig, config);
    }

    // Check for API key (supports multiple providers)
    const hasApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.ALIBABA_CLOUD_API_KEY;

    if (!mergedConfig.enabled) {
      console.log('[OpenCode] Disabled in configuration');
      isInitialized = true;
      return { success: true };
    }

    if (!hasApiKey) {
      console.log('[OpenCode] No API key configured');
      // Still mark as initialized - we'll show UI that needs configuration
      isInitialized = true;
      return { success: true };
    }

    console.log('[OpenCode] Initialized with model:', mergedConfig.model);
    isInitialized = true;
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OpenCode] Initialization error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if OpenCode is initialized
 */
export function isOpenCodeInitialized(): boolean {
  return isInitialized;
}

/**
 * Get current configuration
 */
export async function getConfiguration(): Promise<OpenCodeConfig> {
  return loadOpenCodeConfig();
}

/**
 * Save configuration
 */
export async function saveConfiguration(config: Partial<OpenCodeConfig>): Promise<void> {
  const configPath = getConfigPath();
  const currentConfig = await loadOpenCodeConfig();
  const newConfig = { ...currentConfig, ...config };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
}