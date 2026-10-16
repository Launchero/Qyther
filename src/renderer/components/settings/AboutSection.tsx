import React, { useEffect, useState } from 'react';
import { SectionHeader, GroupLabel } from './primitives';

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getVersion()
      .then((value) => setVersion(String(value)))
      .catch(() => setVersion('unknown'));
  }, []);

  return (
    <div>
      <SectionHeader title="About" description="Qyther is a local-first command palette and desktop agent." />

      <GroupLabel>Version</GroupLabel>
      <p className="mb-[var(--gap-section)] text-sm">{version ?? '…'}</p>

      <GroupLabel>About this app</GroupLabel>
      <p className="max-w-[var(--measure-readable)] text-xs text-muted-foreground">
        Qyther runs entirely on this machine: file search, agent runs and document generation are local.
        Only web-search and model calls reach the network, and the API key is stored encrypted on this
        device.
      </p>
    </div>
  );
}
