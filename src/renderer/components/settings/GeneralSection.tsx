import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useSettings } from './useSettings';
import { SectionHeader, GroupLabel, SettingRow } from './primitives';

export function GeneralSection() {
  const { snapshot, set } = useSettings();
  const [limit, setLimit] = useState('4');

  // Keep the input in step with main without clobbering what the user is mid-edit on.
  useEffect(() => {
    if (snapshot) setLimit(String(snapshot.recentFilesLimit ?? 4));
  }, [snapshot]);

  const commit = () => {
    const parsed = parseInt(limit, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLimit(String(snapshot?.recentFilesLimit ?? 4));
      return;
    }
    set({ recentFilesLimit: Math.min(parsed, 50) });
  };

  return (
    <div>
      <SectionHeader title="General" description="How Qyther behaves on this machine." />

      <GroupLabel>Recent files</GroupLabel>
      <SettingRow title="Remembered files" description="How many recently opened files the palette keeps.">
        <Input
          type="number"
          min={1}
          max={50}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
          aria-label="Recent files limit"
          className="w-20 text-right"
        />
      </SettingRow>

      <GroupLabel>Launch &amp; updates</GroupLabel>
      <SettingRow title="Start at login" description="Launch Qyther when you sign in." comingSoon />
      <SettingRow title="Automatic updates" description="Download and install new versions." comingSoon />
      <SettingRow title="Task completion notifications" description="A toast when a long agent task finishes." comingSoon />
    </div>
  );
}
