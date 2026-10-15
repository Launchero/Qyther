import React, { useState, useEffect, useRef } from 'react';
import { useMCP } from '../hooks/useMCP';
import { MCPServerCard } from './MCPServerCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShortcutKey } from '@/components/common/ShortcutKeys';
import { logError } from '../utils/debugLogger';

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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // No imperative focus effect here: Radix owns `open`'s initial focus and lands it on the
  // first focusable child, which is the search Input below. The old mount effect raced that
  // behaviour and is the reason the caret could not reach the dialog body.

  const loadServers = async () => {
    try {
      const result = await window.electronAPI.mcp.getServers();
      if (isMountedRef.current) {
        setServers(result);
      }
    } catch (error) {
      logError('[MCPToolModal] mcp:getServers rejected:', error);
    }
  };

  const handleToggleServer = async (serverName: string, enabled: boolean) => {
    try {
      await window.electronAPI.mcp.toggleServer(serverName, enabled);
    } catch (error) {
      logError(`[MCPToolModal] mcp:toggleServer rejected for "${serverName}":`, error);
      return;
    }
    await loadServers();
  };

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, []);

  const filteredServers = servers.filter(server => 
    server.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh_-_var(--spacing-16))]">
        <DialogHeader>
          <DialogTitle>MCP Servers</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Search servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
            aria-label="Search MCP servers"
          />

          <div className="space-y-3 max-h-[var(--max-height-scroll-section)] overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                Loading servers...
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {searchQuery ? 'No servers match your search' : 'No MCP servers configured'}
              </div>
            ) : (
              filteredServers.map(server => (
                <MCPServerCard
                  key={server.name}
                  server={server}
                  onToggle={(enabled) => handleToggleServer(server.name, enabled)}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-[var(--gap-inline)]">
              {/* The shared kbd primitive owns the chip shape and the OS modifier name. */}
              <ShortcutKey modifier />
              <ShortcutKey label="T" />
              <span>Close</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {servers.filter(s => s.enabled).length} / {servers.length} enabled
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}