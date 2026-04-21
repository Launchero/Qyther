import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
    <Card 
      size="sm" 
      className={cn(
        "transition-colors",
        server.enabled && "border-primary/50 bg-primary/5"
      )}
    >
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-xs font-medium truncate">{server.name}</CardTitle>
            <CardDescription className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-xs uppercase px-1 py-0 h-4 leading-none">{server.type}</Badge>
              <span className="text-xs">{server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}</span>
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              server.status === 'connected' && "bg-[var(--color-green-500)]",
              server.status === 'disconnected' && "bg-muted-foreground/50",
              server.status === 'error' && "bg-destructive"
            )} />
            <Switch
              checked={server.enabled}
              onCheckedChange={onToggle}
              size="sm"
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}