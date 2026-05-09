import { MultiServerMCPClient, type Connection } from "@langchain/mcp-adapters";
import type { RunnableToolLike } from "@langchain/core/runnables";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { loadPreferences } from "../../preferences";
import { createLogger } from "../../utils/logger";

const log = createLogger('MCP');

export class MCPService {
  private client: MultiServerMCPClient | null = null;
  private tools: (RunnableToolLike | DynamicStructuredTool)[] = [];
  private isInitializedFlag = false;
  private serverToolCounts: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;

    const prefs = loadPreferences();
    const mcpConfig = prefs.mcp;

    if (!mcpConfig?.enabled) {
      log.info('MCP disabled in preferences');
      return;
    }

    try {
      const mcpServers: Record<string, Connection> = {};
      const enabledServers: string[] = [];
      
      for (const server of mcpConfig.servers || []) {
        if (!server.enabled) continue;

        enabledServers.push(server.name);

        if (server.type === 'stdio' && server.command && server.args) {
          mcpServers[server.name] = {
            transport: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
          };
        } else if (server.type === 'http' && server.url) {
          mcpServers[server.name] = {
            transport: "http",
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
      
      // Track tool counts per server
      // MultiServerMCPClient doesn't expose per-server counts, so we use a heuristic:
      // iterate enabled servers and check if they have tools by filtering tool names
      // that typically include server prefixes
      this.serverToolCounts.clear();
      const toolNames = this.tools.map(t => t.name ?? '');
      for (const serverName of enabledServers) {
        // Tools from a server often have names that include the server name as prefix
        const serverTools = toolNames.filter(name => 
          name.startsWith(`${serverName}-`) || name === serverName
        );
        this.serverToolCounts.set(serverName, serverTools.length);
        
        // If no tools matched by prefix, assign total tools if only one server
        if (serverTools.length === 0 && enabledServers.length === 1) {
          this.serverToolCounts.set(serverName, this.tools.length);
        }
      }
      
      log.info(`Initialized with ${this.tools.length} tools across ${enabledServers.length} servers`);
    } catch (error) {
      log.error('Initialization failed:', error);
      throw error;
    }
  }

  async initializeWithRetry(maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.initialize();
        return;
      } catch (error) {
        log.warn(`Retry ${i + 1}/${maxRetries} failed:`, error);
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

  getServerToolCounts(): Map<string, number> {
    return new Map(this.serverToolCounts);
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.tools = [];
      this.isInitializedFlag = false;
      this.serverToolCounts.clear();
      log.info('Cleanup complete');
    }
  }
}

export const mcpService = new MCPService();
