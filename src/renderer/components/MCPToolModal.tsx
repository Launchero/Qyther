import React, { useState, useEffect } from 'react';
import { useMCP } from '../hooks/useMCP';
import { MCPServerCard } from './MCPServerCard';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

interface MCPServer {
  name: string;
  type: 'stdio' | 'http';
  enabled: boolean;
  toolCount: number;
  status: 'connected' | 'disconnected' | 'error';
}

export function MCPToolModal({ onClose }: { onClose: () => void }) {
  const { isLoading } = useMCP();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    const result = await window.electronAPI.mcp.getServers();
    setServers(result);
  };

  const handleToggleServer = async (serverName: string, enabled: boolean) => {
    await window.electronAPI.mcp.toggleServer(serverName, enabled);
    await loadServers();
  };

  return (
    <div className="mcp-tool-modal-overlay" onClick={onClose}>
      <div className="mcp-tool-modal" onClick={e => e.stopPropagation()}>
        <div className="mcp-modal-header">
          <h3 className="mcp-modal-title">MCP Servers</h3>
          <button className="mcp-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M6 18L18 6"/>
            </svg>
          </button>
        </div>

        <div className="mcp-modal-search">
          <input
            type="text"
            placeholder="Search servers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="mcp-search-input"
            autoFocus
          />
        </div>

        <div className="mcp-modal-body">
          {isLoading ? (
            <div className="mcp-loading">Loading servers...</div>
          ) : servers.length === 0 ? (
            <div className="mcp-empty">No MCP servers configured</div>
          ) : (
            <div className="mcp-servers-list">
              {servers
                .filter(server => 
                  server.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(server => (
                  <MCPServerCard
                    key={server.name}
                    server={server}
                    onToggle={(enabled) => handleToggleServer(server.name, enabled)}
                  />
                ))}
            </div>
          )}
        </div>

        <div className="mcp-modal-footer">
          <div className="mcp-footer-hint">
            <kbd>{isMac ? 'Cmd' : 'Ctrl'}</kbd><kbd>T</kbd> Close
          </div>
        </div>
      </div>
    </div>
  );
}
