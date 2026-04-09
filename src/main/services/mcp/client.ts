import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { RunnableToolLike } from "@langchain/core/runnables";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { loadPreferences } from "../../preferences";

export class MCPService {
  private client: MultiServerMCPClient | null = null;
  private tools: (RunnableToolLike | DynamicStructuredTool)[] = [];
  private isInitializedFlag = false;

  async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;

    const prefs = loadPreferences();
    const mcpConfig = prefs.mcp;

    if (!mcpConfig?.enabled) {
      console.log('[MCP] MCP disabled in preferences');
      return;
    }

    try {
      // Build server config from preferences
      const mcpServers: Record<string, any> = {};
      
      for (const server of mcpConfig.servers || []) {
        if (!server.enabled) continue;

        if (server.type === 'stdio' && server.command && server.args) {
          mcpServers[server.name] = {
            transport: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
          };
        } else if (server.type === 'http' && server.url) {
          mcpServers[server.name] = {
            transport: "streamable-http",
            url: server.url,
          };
        }
      }

      this.client = new MultiServerMCPClient({
        mcpServers,
        defaultToolTimeout: 30000, // 30 seconds
      });

      this.tools = await this.client.getTools();
      this.isInitializedFlag = true;
      
      console.log(`[MCP] Initialized with ${this.tools.length} tools`);
    } catch (error) {
      console.error('[MCP] Initialization failed:', error);
      throw error;
    }
  }

  async initializeWithRetry(maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.initialize();
        return;
      } catch (error) {
        console.warn(`[MCP] Retry ${i + 1}/${maxRetries} failed:`, error);
        if (i === maxRetries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  getTools(): (RunnableToolLike | DynamicStructuredTool)[] {
    return this.tools;
  }

  isInitialized(): boolean {
    return this.isInitializedFlag;
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.tools = [];
      this.isInitializedFlag = false;
      console.log('[MCP] Cleanup complete');
    }
  }
}

export const mcpService = new MCPService();
