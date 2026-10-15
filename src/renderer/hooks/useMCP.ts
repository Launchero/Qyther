import { useState, useEffect, useCallback, useRef } from 'react';
import { logError } from '../utils/debugLogger';

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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.mcp.getStatus();
      if (isMountedRef.current) {
        setStatus(result);
      }
    } catch (error) {
      logError('[useMCP] Failed to load MCP status:', error);
    }
  }, []);

  const loadTools = useCallback(async () => {
    try {
      if (isMountedRef.current) {
        setIsLoading(true);
      }
      const result = await window.electronAPI.mcp.getTools();
      if (isMountedRef.current) {
        setTools(result);
      }
    } catch (error) {
      logError('[useMCP] Failed to load MCP tools:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const toggleMCP = useCallback(async () => {
    try {
      await window.electronAPI.mcp.toggle(!status.enabled);
      await loadStatus();
    } catch (error) {
      logError('[useMCP] Failed to toggle MCP:', error);
    }
  }, [status.enabled, loadStatus]);

  const toggleTool = useCallback(async (toolName: string) => {
    try {
      await window.electronAPI.mcp.toggleTool(toolName);
      await loadTools();
    } catch (error) {
      logError('[useMCP] Failed to toggle tool:', error);
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
