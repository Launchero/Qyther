import { MultiServerMCPClient, type Connection } from "@langchain/mcp-adapters";
import type { RunnableToolLike } from "@langchain/core/runnables";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { loadPreferences } from "../../preferences";
import { createLogger } from "../../utils/logger";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const log = createLogger('MCP');

interface MCPServerConfig {
  command: string;
  args: string[];
  disabled?: boolean;
  env?: Record<string, string>;
}

interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}

// Resolve project root. The main bundle is emitted as a single out/main/main.js, so
// import.meta.url points at the bundle directory, not at this source file. Bare
// `__dirname` cannot be used here: main.ts installs its global polyfill after this
// module is evaluated, so it is still undefined at module scope.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MCP_CONFIG_PATH = join(PROJECT_ROOT, "mcp-config.json");

export class MCPService {
  private client: MultiServerMCPClient | null = null;
  private tools: (RunnableToolLike | DynamicStructuredTool)[] = [];
  private isInitializedFlag = false;
  private serverToolCounts: Map<string, number> = new Map();
  private serverNames: string[] = [];

  async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;

    const prefs = loadPreferences();
    const mcpConfig = prefs.mcp;

    if (!mcpConfig?.enabled) {
      log.info('MCP disabled in preferences');
      return;
    }

    // Load server definitions from mcp-config.json, merge with preferences for enabled status
    const configServers = this.loadFromConfigFile();

    try {
      const mcpServers: Record<string, Connection> = {};
      const enabledServers: string[] = [];

      // Build enabled server names from preferences
      const prefEnabledNames = new Set(
        (mcpConfig.servers || [])
          .filter(s => s.enabled)
          .map(s => s.name)
      );

      // Process config file servers
      for (const [name, cfg] of Object.entries(configServers)) {
        const isDisabledByConfig = cfg.disabled ?? false;
        const isDisabledByPref = prefEnabledNames.size > 0 && !prefEnabledNames.has(name);
        if (isDisabledByConfig || isDisabledByPref) continue;

        enabledServers.push(name);

        mcpServers[name] = {
          transport: "stdio",
          command: cfg.command,
          args: cfg.args,
          env: cfg.env,
        };
      }

      // Also include any http-type servers from preferences that aren't in config file
      for (const server of mcpConfig.servers || []) {
        if (!server.enabled || enabledServers.includes(server.name)) continue;
        if (configServers[server.name]) continue; // already handled

        if (server.type === 'stdio' && server.command && server.args) {
          mcpServers[server.name] = {
            transport: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
          };
          enabledServers.push(server.name);
        } else if (server.type === 'http' && server.url) {
          mcpServers[server.name] = {
            transport: "http",
            url: server.url,
          };
          enabledServers.push(server.name);
        }
      }

      if (enabledServers.length === 0) {
        log.info('No MCP servers enabled');
        return;
      }

      this.client = new MultiServerMCPClient({
        mcpServers,
        defaultToolTimeout: 30000, // 30 seconds
      });

      this.tools = await this.client.getTools();
      this.isInitializedFlag = true;
      this.serverNames = enabledServers;

      // Track tool counts per server
      this.serverToolCounts.clear();
      const toolNames = this.tools.map(t => t.name ?? '');
      for (const serverName of enabledServers) {
        const serverTools = toolNames.filter(name =>
          name.startsWith(`${serverName}-`) || name === serverName
        );
        this.serverToolCounts.set(serverName, serverTools.length);

        if (serverTools.length === 0 && enabledServers.length === 1) {
          this.serverToolCounts.set(serverName, this.tools.length);
        }
      }

      log.info(`Initialized with ${this.tools.length} tools across ${enabledServers.length} servers: ${enabledServers.join(", ")}`);
    } catch (error) {
      log.error('Initialization failed:', error);
      throw error;
    }
  }

  private loadFromConfigFile(): Record<string, MCPServerConfig> {
    if (!existsSync(MCP_CONFIG_PATH)) {
      log.warn(`MCP config not found at ${MCP_CONFIG_PATH}`);
      return {};
    }
    try {
      const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
      const parsed: MCPConfigFile = JSON.parse(raw);
      log.info(`Loaded ${Object.keys(parsed.mcpServers).length} server(s) from mcp-config.json`);
      return parsed.mcpServers;
    } catch (error) {
      log.warn('Failed to parse mcp-config.json:', error);
      return {};
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

  getToolsByPrefix(prefix: string): (RunnableToolLike | DynamicStructuredTool)[] {
    return this.tools.filter(t => t.name?.startsWith(prefix) ?? false);
  }

  isInitialized(): boolean {
    return this.isInitializedFlag;
  }

  getServerNames(): string[] {
    return [...this.serverNames];
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
      this.serverNames = [];
      log.info('Cleanup complete');
    }
  }
}

export const mcpService = new MCPService();
