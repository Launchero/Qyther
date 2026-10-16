import React, { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { SectionHeader, GroupLabel, SettingRow } from './primitives';

interface McpServer {
  name: string;
  type: string;
  enabled: boolean;
  toolCount: number;
  status: 'connected' | 'disconnected';
}

export function ToolsSection() {
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [servers, setServers] = useState<McpServer[]>([]);

  const refresh = () => {
    window.electronAPI.mcp.getStatus().then((s) => setMcpEnabled(Boolean(s.enabled))).catch(() => {});
    window.electronAPI.mcp.getServers().then((list) => setServers(list as McpServer[])).catch(() => {});
  };

  useEffect(refresh, []);

  const toggleMaster = async (enabled: boolean) => {
    await window.electronAPI.mcp.toggle(enabled).catch(() => {});
    setMcpEnabled(enabled);
    refresh();
  };

  const toggleServer = async (name: string, enabled: boolean) => {
    await window.electronAPI.mcp.toggleServer(name, enabled).catch(() => {});
    refresh();
  };

  return (
    <div>
      <SectionHeader
        title="Tools & Providers"
        description="Which tools the agent can call. Web search runs on a built-in provider chain."
      />

      <GroupLabel>Model Context Protocol</GroupLabel>
      <SettingRow title="Enable MCP tools" description="Expose connected MCP servers’ tools to the agent.">
        <Switch checked={mcpEnabled} onCheckedChange={toggleMaster} aria-label="Enable MCP tools" />
      </SettingRow>

      {servers.length > 0 && (
        <>
          <GroupLabel>Servers</GroupLabel>
          <div className="space-y-1">
            {servers.map((server) => (
              <div key={server.name} className="flex items-center justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{server.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {server.status} · {server.toolCount} tools
                  </p>
                </div>
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(value) => toggleServer(server.name, value)}
                  aria-label={`Enable ${server.name}`}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <GroupLabel>Web search</GroupLabel>
      <p className="max-w-[var(--measure-readable)] text-xs text-muted-foreground">
        The web tool walks a fallback chain: Exa, Parallel, SearXNG, Marginalia and DuckDuckGo need no key,
        then Tavily and Brave use the TAVILY_API_KEY / BRAVE_API_KEY environment variables.
      </p>

      <GroupLabel>Coming soon</GroupLabel>
      <SettingRow title="Add a server" description="Configure a new stdio or HTTP MCP server." comingSoon />
    </div>
  );
}
