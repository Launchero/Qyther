import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-[var(--gap-section)]">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 max-w-[var(--measure-readable)] text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="mt-[var(--gap-section)] mb-2 text-sm font-medium">{children}</h3>;
}

/**
 * A labelled control row: title + one-line consequence on the left, the control on the right.
 * `comingSoon` swaps the control slot for a disabled badge and a "why not yet" description, so an
 * unbuilt capability is visible and explained rather than silently absent.
 */
export function SettingRow({
  title,
  description,
  children,
  comingSoon,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-[var(--gap-inline)] py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">
        {comingSoon ? (
          <span
            className={cn(
              'inline-block rounded-[var(--radius-chip)] border border-border px-2 py-0.5',
              'text-xs uppercase tracking-wide text-muted-foreground',
            )}
          >
            Coming soon
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
