import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader, GroupLabel } from './primitives';

interface ApiLoad {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  maskedKey?: string;
}

export function ModelApiSection() {
  const [loaded, setLoaded] = useState<ApiLoad | null>(null);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    window.electronAPI.apiConfig
      .load()
      .then((result) => {
        const config = result as ApiLoad;
        setLoaded(config);
        setModel(config.model ?? '');
        setBaseUrl(config.baseUrl ?? '');
      })
      .catch(() => setLoaded({ configured: false }));
  }, []);

  // The stored key is only ever read back masked, so saving needs a full key in the field.
  const canSubmit = Boolean(model.trim() && baseUrl.trim() && apiKey.trim());

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const result = await window.electronAPI.apiConfig
      .save({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      .catch(() => ({ success: false, error: 'Failed to save.' }));
    setBusy(false);
    setStatus(result.success ? { ok: true, text: 'Saved.' } : { ok: false, text: result.error ?? 'Failed to save.' });
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    const result = await window.electronAPI.apiConfig
      .test({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      .catch(() => ({ success: false, error: 'Request failed.' }));
    setBusy(false);
    setStatus(result.success ? { ok: true, text: 'Connection OK.' } : { ok: false, text: result.error ?? 'Connection failed.' });
  };

  const remove = async () => {
    setStatus(null);
    const result = await window.electronAPI.apiConfig.delete().catch(() => ({ success: false }));
    if (result.success) {
      setLoaded(null);
      setApiKey('');
      setStatus({ ok: true, text: 'Removed the stored key.' });
    }
  };

  return (
    <div>
      <SectionHeader
        title="Model & API"
        description="Point the Ask agent at an OpenAI-compatible endpoint. The key is stored encrypted on this machine."
      />

      <GroupLabel>Current</GroupLabel>
      <p className="mb-[var(--gap-section)] text-xs text-muted-foreground">
        {loaded?.configured
          ? `Configured: ${loaded.model ?? 'unknown model'} via ${loaded.baseUrl ?? 'unknown endpoint'} (key ${loaded.maskedKey ?? '—'}).`
          : 'No API configured yet. Ask mode shows its “not configured” card until a key and endpoint are saved.'}
      </p>

      <GroupLabel>Endpoint</GroupLabel>
      <div className="mb-[var(--gap-section)] space-y-2">
        <label className="block text-xs text-muted-foreground">
          Model
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen3.6-plus" className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">
          Base URL
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">
          API key
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={loaded?.maskedKey ? `stored: ${loaded.maskedKey}` : 'sk-…'}
            className="mt-1"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={test} disabled={busy || !canSubmit}>
          Test
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy || !canSubmit}>
          Save
        </Button>
        {loaded?.configured && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        )}
        {status && (
          <span className={`text-xs ${status.ok ? 'text-success' : 'text-destructive'}`}>{status.text}</span>
        )}
      </div>
    </div>
  );
}
