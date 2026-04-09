import React from 'react';
import { useMCP } from '../hooks/useMCP';

export function MCPToolToggle() {
  const { mcpEnabled, toggleMCP, toolsCount, isLoading } = useMCP();

  return (
    <button
      onClick={toggleMCP}
      className={`mcp-tool-toggle ${mcpEnabled ? 'enabled' : ''}`}
      disabled={isLoading}
      title={mcpEnabled ? 'MCP tools enabled' : 'MCP tools disabled'}
    >
      <svg className="mcp-toggle-icon" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" 
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      
      {mcpEnabled && toolsCount > 0 && (
        <span className="mcp-tools-count">{toolsCount}</span>
      )}
    </button>
  );
}
