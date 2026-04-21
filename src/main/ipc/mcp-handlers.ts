import { ipcMain } from 'electron';
import { mcpService } from '../services/mcp/client';
import { langChainAgent } from '../services/langchain/agent';
import { savePreferences, loadPreferences } from '../preferences';
import { registerBrowserHandlers } from './browser-handlers';

export function registerMCPHandlers(): void {
  ipcMain.handle('mcp:initialize', async () => {
    try {
      await mcpService.initialize();
      await langChainAgent.initializeMCP();
      
      return { 
        success: true, 
        toolsCount: mcpService.getTools().length,
        enabled: langChainAgent.isUsingMCP(),
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get MCP status
  ipcMain.handle('mcp:getStatus', async () => {
    const prefs = loadPreferences();
    return {
      enabled: prefs.mcp?.enabled ?? false,
      initialized: mcpService.isInitialized(),
      toolsCount: mcpService.getTools().length,
    };
  });

  // Toggle MCP enabled
  ipcMain.handle('mcp:toggle', async (_, enabled: boolean) => {
    const prefs = loadPreferences();
    savePreferences({
      mcp: {
        ...prefs.mcp,
        enabled,
      },
    });
    
    // Reinitialize MCP if enabling
    if (enabled) {
      await mcpService.initialize();
      await langChainAgent.initializeMCP();
    }
    
    return { success: true, enabled };
  });

  // Get tools list with enabled status
  ipcMain.handle('mcp:getTools', async () => {
    const tools = mcpService.getTools();
    const prefs = loadPreferences();
    const enabledTools = prefs.mcp?.enabledTools || [];
    
    return tools.map(tool => ({
      name: tool.name ?? 'unknown',
      description: tool.description ?? '',
      enabled: enabledTools.includes(tool.name ?? ''),
    }));
  });

  // Get servers with status
  ipcMain.handle('mcp:getServers', async () => {
    const prefs = loadPreferences();
    const enabledServers = prefs.mcp?.enabledServers || [];
    const serverConfigs = prefs.mcp?.servers || [];
    const serverToolCounts = mcpService.getServerToolCounts();
    
    return serverConfigs.map(server => ({
      name: server.name,
      type: server.type,
      enabled: enabledServers.includes(server.name),
      toolCount: serverToolCounts.get(server.name) ?? 0,
      status: mcpService.isInitialized() && enabledServers.includes(server.name) ? 'connected' : 'disconnected',
    }));
  });

  // Toggle server
  ipcMain.handle('mcp:toggleServer', async (_, serverName: string, enabled: boolean) => {
    const prefs = loadPreferences();
    const enabledServers = prefs.mcp?.enabledServers || [];
    
    const serverIndex = enabledServers.indexOf(serverName);
    if (serverIndex === -1 && enabled) {
      enabledServers.push(serverName);
    } else if (serverIndex !== -1 && !enabled) {
      enabledServers.splice(serverIndex, 1);
    }
    
    savePreferences({
      mcp: {
        ...prefs.mcp,
        enabledServers,
      },
    });
    
    // Reinitialize MCP to apply changes
    await mcpService.cleanup();
    await mcpService.initialize();
    await langChainAgent.initializeMCP();
    
    return { success: true, enabledServers };
  });

  // Toggle individual tool
  ipcMain.handle('mcp:toggleTool', async (_, toolName: string) => {
    const prefs = loadPreferences();
    const enabledTools = prefs.mcp?.enabledTools || [];
    
    const toolIndex = enabledTools.indexOf(toolName);
    if (toolIndex === -1) {
      // Enable tool
      enabledTools.push(toolName);
    } else {
      // Disable tool
      enabledTools.splice(toolIndex, 1);
    }
    
    savePreferences({
      mcp: {
        ...prefs.mcp,
        enabledTools,
      },
    });
    
    // Reinitialize to apply changes
    await mcpService.cleanup();
    await mcpService.initialize();
    await langChainAgent.initializeMCP();
    
    return { success: true, enabledTools };
  });

  // Browser-specific handlers
  ipcMain.handle('browser:initializeAgent', async (_, config?: { headed?: boolean }) => {
    try {
      await langChainAgent.initializeBrowserAgent(config);
      return {
        success: true,
        message: 'Browser agent initialized',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('browser:getStatus', async () => {
    return {
      success: true,
      browserModeEnabled: langChainAgent.isBrowserModeEnabled(),
      browserAgentInitialized: langChainAgent.isBrowserAgentInitialized(),
    };
  });
}

// Export browser handler registration
export { registerBrowserHandlers };
