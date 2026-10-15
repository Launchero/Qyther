import {
  McpClient,
  StdioTransport,
  StreamableHttpTransport,
  toLlmContent,
  type LlmContent,
  type Tool as McpToolDef,
} from "@earendil-works/pi-mcp";
import { Type } from "@earendil-works/pi-ai";
import { loadPreferences } from "../../preferences";
import { createLogger } from "../../utils/logger";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fail, text, type PiTool } from "../pi/toolbox";

const log = createLogger('MCP');

/** Per-call budget. Replaces the old adapter's `defaultToolTimeout: 30000`. */
const MCP_TOOL_TIMEOUT_MS = 30_000;

interface MCPServerConfig {
  command: string;
  args: string[];
  disabled?: boolean;
  env?: Record<string, string>;
}

interface MCPConfigFile {
  mcpServers: Record<string, MCPServerConfig>;
}

type McpServerDef =
  | { kind: "stdio"; name: string; command: string; args: string[]; env?: Record<string, string> }
  | { kind: "http"; name: string; url: string };

/**
 * One connected server. `pi-mcp` is single-transport — one `McpClient` per
 * server — where the old `MCPAdapter` took a server map. The singleton below
 * still owns every connection, so a second client for the same server is
 * never constructed and no stdio child is ever shared or double-closed.
 */
interface McpConnection {
  serverName: string;
  client: McpClient;
  tools: PiTool[];
}

// Resolve project root. The main bundle is emitted as a single out/main/main.js, so
// import.meta.url points at the bundle directory, not at this source file. Bare
// `__dirname` cannot be used here: main.ts installs its global polyfill after this
// module is evaluated, so it is still undefined at module scope.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MCP_CONFIG_PATH = join(PROJECT_ROOT, "mcp-config.json");

/**
 * The server's JSON Schema as Pi `parameters`. Anything that is not an object
 * schema falls back to a permissive object: `callTool` still validates
 * server-side, so a loose Pi-side schema cannot make a wrong call succeed —
 * it only moves the error into the tool result where the model can read it.
 */
function toParametersSchema(raw: unknown): ReturnType<typeof Type.Unsafe> {
  if (raw !== null && typeof raw === "object" && (raw as { type?: unknown }).type === "object") {
    const copy = { ...(raw as Record<string, unknown>) };
    delete copy.$schema;
    return Type.Unsafe(copy);
  }
  return Type.Unsafe({ type: "object" });
}

/** `LlmContent` blocks into the text/image content a `PiTool` result carries. */
function toPiContent(blocks: LlmContent[], name: string) {
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
  for (const block of blocks) {
    if (block.type === "image") content.push({ type: "image", data: block.data, mimeType: block.mimeType });
    else content.push({ type: "text", text: block.text });
  }
  if (content.length === 0) content.push({ type: "text" as const, text: `(tool ${name} returned no text)` });
  return content;
}

/**
 * One server tool as a `PiTool`. `Type.Unsafe` wraps the server's own JSON
 * Schema verbatim — converting the schema AST is unnecessary because the
 * server already declares it. Tools never throw: an MCP failure, including arg
 * validation, returns a readable result for the model to recover from.
 */
function toPiTool(serverName: string, def: McpToolDef, client: McpClient): PiTool {
  const name = def.name;
  const description =
    typeof def.description === "string" && def.description.length > 0
      ? def.description
      : `MCP tool ${name} from server ${serverName}.`;
  return {
    name,
    label: name,
    description,
    parameters: toParametersSchema(def.inputSchema),
    async execute(_id, params, signal) {
      try {
        const result = await client.callTool(name, (params ?? {}) as Record<string, unknown>, {
          signal,
          timeoutMs: MCP_TOOL_TIMEOUT_MS,
        });
        const content = toPiContent(toLlmContent(result), name);
        if (result.isError) return { content, details: { status: "error" }, isError: true };
        return { content, details: { status: "complete" } };
      } catch (e) {
        if (signal?.aborted) return text(`MCP tool ${name} cancelled.`, "error");
        return fail(`MCP tool ${name} failed`, e);
      }
    },
  };
}

export class MCPService {
  private connections: McpConnection[] = [];
  private tools: PiTool[] = [];
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
    const defs = this.buildEnabledServers(configServers, mcpConfig.servers ?? [], mcpConfig);

    if (defs.length === 0) {
      log.info('No MCP servers enabled');
      return;
    }

    // Open every connection into locals and publish only on success. A throw
    // below closes everything opened so far: parking a half-built client on
    // the field would orphan its stdio child, and `initializeWithRetry` makes
    // up to three attempts per boot.
    const opened: McpConnection[] = [];
    try {
      for (const def of defs) opened.push(await this.connectServer(def));
    } catch (error) {
      await this.closeConnections(opened);
      log.error('Initialization failed:', error);
      throw error;
    }

    this.publish(opened);
    log.info(`Initialized with ${this.tools.length} tools across ${this.serverNames.length} servers: ${this.serverNames.join(", ")}`);
  }

  /**
   * Config merge precedence, unchanged from the adapter era:
   * config-file servers (dropped when `disabled` or not preference-enabled),
   * then preference-only stdio/http servers. Http is the only non-stdio transport.
   */
  private buildEnabledServers(
    configServers: Record<string, MCPServerConfig>,
    prefServers: NonNullable<NonNullable<ReturnType<typeof loadPreferences>["mcp"]>["servers"]>,
    mcpConfig: NonNullable<ReturnType<typeof loadPreferences>["mcp"]>,
  ): McpServerDef[] {
    const defs: McpServerDef[] = [];
    const enabledServers: string[] = [];
    const prefEnabledNames = new Set(
      (mcpConfig.servers || []).filter(s => s.enabled).map(s => s.name),
    );
    for (const [name, cfg] of Object.entries(configServers)) {
      const isDisabledByConfig = cfg.disabled ?? false;
      const isDisabledByPref = prefEnabledNames.size > 0 && !prefEnabledNames.has(name);
      if (isDisabledByConfig || isDisabledByPref) continue;
      enabledServers.push(name);
      defs.push({ kind: "stdio", name, command: cfg.command, args: cfg.args, env: cfg.env });
    }
    for (const server of prefServers) {
      if (!server.enabled || enabledServers.includes(server.name)) continue;
      if (configServers[server.name]) continue; // already handled
      if (server.type === 'stdio' && server.command && server.args) {
        defs.push({ kind: "stdio", name: server.name, command: server.command, args: server.args, env: server.env });
        enabledServers.push(server.name);
      } else if (server.type === 'http' && server.url) {
        defs.push({ kind: "http", name: server.name, url: server.url });
        enabledServers.push(server.name);
      }
    }
    return defs;
  }

  /** Connect one server and convert its tools. Never leaves a handle behind. */
  private async connectServer(def: McpServerDef): Promise<McpConnection> {
    const transport =
      def.kind === "stdio"
        ? new StdioTransport({ command: def.command, args: def.args, env: def.env })
        : new StreamableHttpTransport({ url: def.url });
    // `close()` kills the transport's child, so closing the client is the
    // only release this connection needs — on every path below.
    const client = new McpClient({ name: "qyther", version: "1.0.0" });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      return { serverName: def.name, client, tools: listed.map((tool) => toPiTool(def.name, tool, client)) };
    } catch (error) {
      await client.close().catch((closeError) => {
        log.warn('Failed to close MCP client after a failed connect:', closeError);
      });
      throw error;
    }
  }

  /** Publish opened connections: dedupe names, count per server, go live. */
  private publish(opened: McpConnection[]): void {
    const seen = new Set<string>();
    const tools: PiTool[] = [];
    this.serverToolCounts.clear();
    for (const conn of opened) {
      this.serverToolCounts.set(conn.serverName, conn.tools.length);
      for (const tool of conn.tools) {
        if (seen.has(tool.name)) {
          log.warn(`Duplicate MCP tool "${tool.name}" from "${conn.serverName}" ignored`);
          continue;
        }
        seen.add(tool.name);
        tools.push(tool);
      }
    }
    this.connections = opened;
    this.tools = tools;
    this.isInitializedFlag = true;
    this.serverNames = opened.map((conn) => conn.serverName);
  }

  /** Best-effort close of every connection. Never rejects. */
  private async closeConnections(opened: McpConnection[]): Promise<void> {
    for (const conn of opened) {
      try {
        await conn.client.close();
      } catch (error) {
        log.warn(`Failed to close MCP client for "${conn.serverName}":`, error);
      }
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

  getTools(): PiTool[] {
    return this.tools;
  }

  getToolsByPrefix(prefix: string): PiTool[] {
    return this.tools.filter(t => t.name.startsWith(prefix));
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
    await this.closeConnections(this.connections);
    this.connections = [];
    this.tools = [];
    this.isInitializedFlag = false;
    this.serverToolCounts.clear();
    this.serverNames = [];
    log.info('Cleanup complete');
  }
}

export const mcpService = new MCPService();
