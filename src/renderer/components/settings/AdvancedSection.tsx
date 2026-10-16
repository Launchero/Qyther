import React, { useEffect, useState } from 'react';
import { SectionHeader, GroupLabel, SettingRow } from './primitives';

interface RuntimeInfo {
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platformName: string;
}

export function AdvancedSection() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    window.electronAPI.getSystemInfo()
      .then((result) => setInfo(result as RuntimeInfo))
      .catch(() => {});
  }, []);

  return (
    <div>
      <SectionHeader title="Advanced" description="Environment details, for support and diagnostics." />

      <GroupLabel>Runtime</GroupLabel>
      {info ? (
        <dl className="mb-[var(--gap-section)] space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Electron</dt>
            <dd>{info.electronVersion}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Chromium</dt>
            <dd>{info.chromeVersion}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Node</dt>
            <dd>{info.nodeVersion}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Platform</dt>
            <dd>{info.platformName}</dd>
          </div>
        </dl>
      ) : (
        <p className="mb-[var(--gap-section)] text-xs text-muted-foreground">Loading…</p>
      )}

      <GroupLabel>Coming soon</GroupLabel>
      <SettingRow title="Log level" description="How much detail Qyther writes to its on-disk log." comingSoon />
      <SettingRow title="Developer tools" description="Expose the debug port and an in-app console." comingSoon />
    </div>
  );
}
