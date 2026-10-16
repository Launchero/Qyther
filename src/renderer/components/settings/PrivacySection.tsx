import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeader, GroupLabel, SettingRow } from './primitives';

export function PrivacySection() {
  const [userDataPath, setUserDataPath] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getSystemInfo()
      .then((info) => setUserDataPath(info.userDataPath as string))
      .catch(() => {});
  }, []);

  const clearRecentFiles = () => {
    localStorage.removeItem('recent-files');
  };

  return (
    <div>
      <SectionHeader title="Privacy & Data" description="What Qyther stores on this machine, and how to clear it." />

      <GroupLabel>Data on this machine</GroupLabel>
      <SettingRow title="Recent files" description="The list the palette remembers, kept in local storage.">
        <Button type="button" size="sm" variant="outline" onClick={clearRecentFiles}>
          Clear
        </Button>
      </SettingRow>
      <SettingRow title="Storage location" description="Where Qyther keeps its database and configuration.">
        <span className="max-w-[40%] truncate text-xs text-muted-foreground" title={userDataPath ?? undefined}>
          {userDataPath ?? '…'}
        </span>
      </SettingRow>

      <GroupLabel>Coming soon</GroupLabel>
      <SettingRow title="Remove personal data from prompts" description="Redact paths and names before they reach the model." comingSoon />
      <SettingRow title="Exclude clipboard history" description="Keep text you copy out of the system clipboard history." comingSoon />
    </div>
  );
}
