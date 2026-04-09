import React from 'react';

interface MCPServer {
  name: string;
  type: 'stdio' | 'http';
  enabled: boolean;
  toolCount: number;
  status: 'connected' | 'disconnected' | 'error';
}

export function MCPServerCard({ 
  server, 
  onToggle 
}: { 
  server: MCPServer; 
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className={`mcp-server-card ${server.enabled ? 'enabled' : 'disabled'}`}>
      <div className="mcp-server-header">
        <div className="mcp-server-info">
          <div className="mcp-server-name">{server.name}</div>
          <div className="mcp-server-meta">
            <span className="mcp-server-type">{server.type}</span>
            <span className="mcp-server-tools">{server.toolCount} tools</span>
          </div>
        </div>
        
        <div className="mcp-server-controls">
          <span className={`mcp-server-status ${server.status}`} />
          <label className="mcp-server-toggle">
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="mcp-server-checkbox"
            />
            <span className="mcp-toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
