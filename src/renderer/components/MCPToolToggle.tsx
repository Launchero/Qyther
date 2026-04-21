import React from 'react';
import { useMCP } from '../hooks/useMCP';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WrenchIcon } from '@phosphor-icons/react';

export function MCPToolToggle() {
  const { mcpEnabled, toggleMCP, toolsCount, isLoading } = useMCP();

  return (
    <Button
      variant={mcpEnabled ? 'secondary' : 'ghost'}
      size="sm"
      onClick={toggleMCP}
      disabled={isLoading}
      className="gap-2"
      title={mcpEnabled ? 'MCP tools enabled' : 'MCP tools disabled'}
    >
      <WrenchIcon className="h-4 w-4" />

      {mcpEnabled && toolsCount > 0 && (
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
          {toolsCount}
        </Badge>
      )}
    </Button>
  );
}