import React, { useState, useEffect, useRef } from 'react';
import { useMCP } from '../hooks/useMCP';
import { MCPServerCard } from './MCPServerCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getOSDisplayNamesSync } from '@/utils/shortcuts';

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
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const loadServers = async () => {
    const result = await window.electronAPI.mcp.getServers();
    setServers(result);
  };

  const handleToggleServer = async (serverName: string, enabled: boolean) => {
    await window.electronAPI.mcp.toggleServer(serverName, enabled);
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
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>MCP Servers</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            ref={inputRef}
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
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">{getOSDisplayNamesSync().modifierLabel}</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">T</kbd>
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