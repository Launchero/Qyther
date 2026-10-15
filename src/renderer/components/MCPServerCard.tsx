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
              <Badge variant="outline" className="text-xs uppercase px-1.5 py-0.5 h-5 leading-none">{server.type}</Badge>
              <span className="text-xs">{server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}</span>
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status is colour-only, so it needs its own accessible name; the raw
                --color-green-500 primitive is illegible in dark and is replaced by the
                semantic --success pair. */}
            <span
              role="img"
              aria-label={`Status: ${server.status}`}
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                server.status === 'connected' && "bg-success",
                server.status === 'disconnected' && "bg-muted-foreground/50",
                server.status === 'error' && "bg-destructive"
              )} />
            <Switch
              checked={server.enabled}
              onCheckedChange={onToggle}
              size="sm"
              aria-label={`Enable ${server.name}`}
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}