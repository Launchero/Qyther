import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MonitorIcon, WarningIcon, CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface DesktopConfirmationDialogProps {
  action: string;
  description: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export function DesktopConfirmationDialog({
  action,
  description,
  onConfirm,
  onDeny,
}: DesktopConfirmationDialogProps) {
  return (
    <div className="desktop-confirmation-dialog border-border rounded-[var(--radius-md)] border bg-secondary/50 p-[var(--spacing-4)] mx-[var(--spacing-6)] my-[var(--spacing-3)]">
      <div className="confirmation-header flex items-center gap-[var(--spacing-2)] mb-[var(--spacing-3)]">
        <MonitorIcon className="text-foreground" weight="fill" size={18} />
        <span className="text-sm font-medium text-foreground">Desktop Action Required</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          <WarningIcon weight="bold" size={12} className="mr-1" />
          Requires Approval
        </Badge>
      </div>

      <div className="confirmation-body">
        <p className="text-xs text-muted-foreground mb-[var(--spacing-1)]">
          The AI wants to perform this desktop action:
        </p>
        <div className="action-preview rounded-[var(--radius-sm)] bg-background border-border border p-[var(--spacing-3)] mb-[var(--spacing-3)]">
          <div className="action-type flex items-center gap-[var(--spacing-2)] mb-[var(--spacing-1)]">
            <span className="text-xs font-mono text-foreground font-semibold uppercase tracking-wide">
              {action}
            </span>
          </div>
          <p className="text-sm text-foreground">{description}</p>
        </div>

        <p className="text-xs text-muted-foreground mb-[var(--spacing-3)]">
          This action will interact with your desktop. Only approve actions you understand and trust.
        </p>
      </div>

      <div className="confirmation-actions flex gap-[var(--spacing-2)] justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onDeny}
          className={cn(
            'flex items-center gap-[var(--spacing-1)] text-xs',
            'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50',
          )}
        >
          <XCircleIcon weight="bold" size={14} />
          Deny
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          className="flex items-center gap-[var(--spacing-1)] text-xs"
        >
          <CheckCircleIcon weight="bold" size={14} />
          Approve
        </Button>
      </div>
    </div>
  );
}
