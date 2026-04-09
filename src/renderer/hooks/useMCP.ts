import { useState, useEffect, useCallback } from 'react';

interface MCPStatus {
  enabled: boolean;
  initialized: boolean;
  toolsCount: number;
}

interface Tool {
  name: string;
  description: string;
  enabled: boolean;
}

export function useMCP() {
  const [status, setStatus] = useState<MCPStatus>({
    enabled: false,
    initialized: false,
    toolsCount: 0,
  });
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.mcp.getStatus();
      setStatus(result);
    } catch (error) {
      console.error('Failed to load MCP status:', error);
    }
  }, []);

  const loadTools = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.mcp.getTools();
      setTools(result);
    } catch (error) {
      console.error('Failed to load MCP tools:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleMCP = useCallback(async () => {
    try {
      await window.electronAPI.mcp.toggle(!status.enabled);
      await loadStatus();
    } catch (error) {
      console.error('Failed to toggle MCP:', error);
    }
  }, [status.enabled, loadStatus]);

  const toggleTool = useCallback(async (toolName: string) => {
    try {
      await window.electronAPI.mcp.toggleTool(toolName);
      await loadTools();
    } catch (error) {
      console.error('Failed to toggle tool:', error);
    }
  }, [loadTools]);

  useEffect(() => {
    loadStatus();
    loadTools();
  }, [loadStatus, loadTools]);

  return {
    mcpEnabled: status.enabled,
    mcpInitialized: status.initialized,
    toolsCount: status.toolsCount,
    tools,
    isLoading,
    toggleMCP,
    toggleTool,
    refresh: loadStatus,
  };
}
