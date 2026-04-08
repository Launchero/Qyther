import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * MCP Server configuration and status
 */
export interface MCPServerState {
  id: string;
  name: string;
  type: 'local' | 'remote';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  command?: string[];
  url?: string;
  enabled: boolean;
  error?: string;
  lastChecked?: string;
}

interface MCPServersConfig {
  [key: string]: {
    type: 'local' | 'remote';
    command?: string[];
    url?: string;
    enabled: boolean;
    headers?: Record<string, string>;
  };
}

// In-memory server states
const serverStates: Map<string, MCPServerState> = new Map();

/**
 * Load MCP servers from opencode.json
 */
export async function loadMCPServers(): Promise<MCPServerState[]> {
  const projectRoot = app.getAppPath();
  const configPath = path.join(projectRoot, 'opencode.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    const servers: MCPServerState[] = [];

    if (config.mcp) {
      const mcpConfig = config.mcp as MCPServersConfig;

      for (const [name, serverConfig] of Object.entries(mcpConfig)) {
        const serverState: MCPServerState = {
          id: name,
          name: name,
          type: serverConfig.type || 'local',
          status: serverConfig.enabled ? 'disconnected' : 'disconnected',
          command: serverConfig.command,
          url: serverConfig.url,
          enabled: serverConfig.enabled !== false,
        };

        servers.push(serverState);
        serverStates.set(name, serverState);
      }
    }

    return servers;
  } catch (error) {
    console.log('[OpenCode MCP] No MCP configuration found');
    return getDefaultMCPServers();
  }
}

/**
 * Get default MCP servers when no config exists
 */
function getDefaultMCPServers(): MCPServerState[] {
  const defaults: MCPServerState[] = [
    {
      id: 'filesystem',
      name: 'Filesystem',
      type: 'local',
      status: 'disconnected',
      enabled: false,
    },
    {
      id: 'github',
      name: 'GitHub',
      type: 'remote',
      url: 'https://mcp.github.com',
      status: 'disconnected',
      enabled: false,
    },
    {
      id: 'context7',
      name: 'Context7',
      type: 'remote',
      url: 'https://context7.mcp.server',
      status: 'disconnected',
      enabled: false,
    },
  ];

  for (const server of defaults) {
    serverStates.set(server.id, server);
  }

  return defaults;
}

/**
 * Get MCP server status
 */
export function getMCPServerStatus(serverId: string): MCPServerState | undefined {
  return serverStates.get(serverId);
}

/**
 * Get all MCP server statuses
 */
export function getAllMCPServerStatus(): MCPServerState[] {
  return Array.from(serverStates.values());
}

/**
 * Update server status
 */
export function updateServerStatus(
  serverId: string,
  status: MCPServerState['status'],
  error?: string
): void {
  const server = serverStates.get(serverId);
  if (server) {
    server.status = status;
    server.error = error;
    server.lastChecked = new Date().toISOString();
  }
}

/**
 * Get enabled MCP servers
 */
export function getEnabledMCPServers(): MCPServerState[] {
  return Array.from(serverStates.values()).filter(s => s.enabled);
}

/**
 * Get MCP server by ID
 */
export function getMCPServerById(id: string): MCPServerState | undefined {
  return serverStates.get(id);
}

/**
 * Initialize default servers
 */
export async function initializeMCPServers(): Promise<MCPServerState[]> {
  return loadMCPServers();
}

/**
 * Check if any MCP server is enabled
 */
export function hasMCPServersEnabled(): boolean {
  return Array.from(serverStates.values()).some(s => s.enabled);
}

/**
 * Get MCP server list for UI display
 */
export function getMCPServerList(): Array<{
  id: string;
  name: string;
  status: string;
  icon: string;
}> {
  const icons: Record<string, string> = {
    filesystem: '📁',
    github: '🐙',
    context7: '📚',
    playwright: '🎭',
    rube: '🤖',
  };

  return Array.from(serverStates.values()).map(server => ({
    id: server.id,
    name: server.name,
    status: server.status,
    icon: icons[server.id] || '🔌',
  }));
}