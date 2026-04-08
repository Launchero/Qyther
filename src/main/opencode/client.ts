import { createOpencode } from '@opencode-ai/sdk';
import { loadOpenCodeConfig, type OpenCodeConfig } from './config.js';

/**
 * OpenCode SDK Client
 * Singleton instance of the OpenCode SDK client
 */
let client: Awaited<ReturnType<typeof import('@opencode-ai/sdk').createOpencodeClient>> | null = null;
let isInitializing = false;

/**
 * Get or create OpenCode SDK client instance
 */
export async function getOpenCodeClient(): Promise<Awaited<ReturnType<typeof import('@opencode-ai/sdk').createOpencodeClient>>> {
  if (client) {
    return client;
  }

  if (isInitializing) {
    // Wait for initialization to complete
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!isInitializing && client) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
    return client!;
  }

  isInitializing = true;

  try {
    const config = await loadOpenCodeConfig();
    console.log('[OpenCode Client] Initializing with model:', config.model);

    // Build MCP configuration from enabled servers
    const mcpConfig: Record<string, any> = {};
    for (const server of config.mcpServers.filter(s => s.enabled)) {
      mcpConfig[server.id] = {
        type: server.type,
        command: server.command,
        url: server.url,
        headers: server.headers,
      };
    }

    // Build provider configuration from environment variables
    const providerConfig: Record<string, any> = {};
    const hasApiKey = process.env.ALIBABA_CLOUD_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY;

    if (!hasApiKey) {
      throw new Error(
        'No API key configured. Please set at least one of: ALIBABA_CLOUD_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in your .env file'
      );
    }

    if (process.env.OPENAI_API_KEY) {
      providerConfig.openai = {
        options: {
          apiKey: process.env.OPENAI_API_KEY,
        },
      };
    }

    if (process.env.ANTHROPIC_API_KEY) {
      providerConfig.anthropic = {
        options: {
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      };
    }

    if (process.env.GOOGLE_API_KEY) {
      providerConfig.google = {
        options: {
          apiKey: process.env.GOOGLE_API_KEY,
        },
      };
    }

    // Alibaba Cloud Model Studio (for alibaba-coding-plan models)
    if (process.env.ALIBABA_CLOUD_API_KEY) {
      providerConfig['alibaba-coding-plan'] = {
        npm: '@ai-sdk/anthropic',
        name: 'Alibaba Cloud Model Studio',
        options: {
          baseURL: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1',
          apiKey: process.env.ALIBABA_CLOUD_API_KEY,
        },
      };
    }

    // Connect to Cursor's OpenCode server on port 4096
    const openCodeUrl = process.env.OPENCODE_BASE_URL || 'http://localhost:4096';
    console.log('[OpenCode Client] Connecting to server at', openCodeUrl);
    
    try {
      const { createOpencodeClient } = await import('@opencode-ai/sdk');
      client = createOpencodeClient({
        baseUrl: openCodeUrl,
      });
      console.log('[OpenCode Client] Connected to server at', openCodeUrl);
    } catch (connectError) {
      const errorMessage = connectError instanceof Error ? connectError.message : 'Unknown error';
      console.error('[OpenCode Client] Failed to initialize:', errorMessage);
      throw new Error(`Failed to connect to OpenCode server at ${openCodeUrl}: ${errorMessage}`);
    }

    console.log('[OpenCode Client] Client initialized successfully');
    isInitializing = false;
    return client;
  } catch (error) {
    console.error('[OpenCode Client] Failed to initialize:', error);
    isInitializing = false;
    throw error;
  }
}

/**
 * Check if client is initialized
 */
export function isClientInitialized(): boolean {
  return client !== null;
}

/**
 * Reset client (for testing/reconfiguration)
 */
export function resetClient(): void {
  client = null;
  isInitializing = false;
}
