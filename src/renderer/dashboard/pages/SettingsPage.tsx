import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { api } from '../../lib/api';
import type { AppSettings } from '@shared/types';
import { Badge, Button, Card, Field, Page, Switch, TextInput } from '../../components/ui';

const MODEL_FIELDS: { key: string; label: string; hint: string; suggest: string[] }[] = [
  {
    key: 'answer',
    label: 'Answer generation',
    hint: 'Main model that writes interview answers (streamed).',
    suggest: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  },
  {
    key: 'parsing',
    label: 'Resume / JD parsing',
    hint: 'Extracts structured JSON from documents.',
    suggest: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  },
  {
    key: 'classify',
    label: 'Question detection',
    hint: 'Classifies interviewer utterances.',
    suggest: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1'],
  },
  {
    key: 'embedding',
    label: 'Embeddings (retrieval)',
    hint: 'Vectorizes profile chunks + queries for RAG.',
    suggest: ['text-embedding-3-small', 'text-embedding-3-large'],
  },
  {
    key: 'transcription',
    label: 'Speech-to-text',
    hint: 'Transcribes microphone audio.',
    suggest: ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'],
  },
];

export default function SettingsPage() {
  const { settings, load, saveApiKey, clearApiKey, testApiKey } = useSettingsStore();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Local mirror so the switch updates instantly (optimistic), then reconciles.
  const [privacyOn, setPrivacyOn] = useState(true);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (settings) setPrivacyOn(settings.privacyMode);
  }, [settings]);

  const onSave = async () => {
    setSaving(true);
    setStatus('Saving…');
    try {
      await saveApiKey(key);
      setKey('');
      setStatus('Saved. The key is encrypted via your OS secure storage.');
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setStatus('Testing…');
    const res = await testApiKey();
    setStatus(res.ok ? `OK — reachable (e.g. ${res.model}).` : `Failed: ${res.error}`);
    setTesting(false);
  };

  const setPrivacy = async (next: boolean) => {
    if (privacyBusy) return;
    setPrivacyBusy(true);
    setPrivacyOn(next); // optimistic
    try {
      const res = (await api.privacy.set(next)) as { enabled: boolean };
      setPrivacyOn(res.enabled); // reconcile with truth
      await load();
    } catch {
      setPrivacyOn(!next); // revert on failure
    } finally {
      setPrivacyBusy(false);
    }
  };

  return (
    <Page title="Settings" width="max-w-2xl">
      <Card className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="font-medium">OpenAI API Key</h3>
          {settings?.apiKeyPresent ? <Badge tone="green">configured</Badge> : <Badge tone="amber">not set</Badge>}
        </div>
        <p className="mb-4 text-sm text-neutral-400">
          Stored encrypted in the main process and never exposed to this window.
        </p>
        <Field label="API key">
          <div className="flex gap-2">
            <TextInput
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-…"
            />
            <Button variant="primary" onClick={onSave} disabled={!key} loading={saving}>
              Save
            </Button>
          </div>
        </Field>
        <div className="mt-3 flex gap-2">
          <Button onClick={onTest} loading={testing}>
            Test connection
          </Button>
          <Button variant="ghost" className="text-red-300" onClick={() => clearApiKey()}>
            Clear key
          </Button>
        </div>
        {status && <p className="mt-3 text-sm text-neutral-300">{status}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Privacy Mode</h3>
            <p className="text-xs text-neutral-500">
              {privacyOn
                ? 'Hidden from screen sharing & recording'
                : 'Visible to screen sharing & recording'}
            </p>
          </div>
          <Switch checked={privacyOn} onChange={setPrivacy} onLabel="Hidden" offLabel="Visible" />
        </div>
        <p className="mt-3 text-sm text-neutral-400">
          When on, <strong>all app windows</strong> (dashboard, overlay, and region selector) are
          excluded from OS screen capture, so they don’t appear when you share your screen in Zoom,
          Google Meet, Teams, or a recording. This only affects screen capture — it does not hide the
          app from your operating system or task manager.
        </p>
        <p className="mt-2 text-xs text-amber-300/80">
          Only use AI assistance where it is permitted. You are responsible for following the rules
          of your interview, exam, or call.
        </p>
      </Card>

      {settings && <ModelsCard settings={settings} onSaved={load} />}
    </Page>
  );
}

function ModelsCard({ settings, onSaved }: { settings: AppSettings; onSaved: () => Promise<void> }) {
  const [overrides, setOverrides] = useState<Record<string, string>>(settings.models ?? {});
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setOverrides(settings.models ?? {}), [settings.models]);

  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of MODEL_FIELDS) {
      map[f.key] = Array.from(new Set([...f.suggest, ...available]));
    }
    return map;
  }, [available]);

  const refreshList = async () => {
    setLoadingList(true);
    setStatus(null);
    try {
      const list = await api.settings.listModels();
      setAvailable(list);
      setStatus(`Loaded ${list.length} models from your account.`);
    } catch (e) {
      setStatus(`Could not list models: ${(e as Error).message}`);
    } finally {
      setLoadingList(false);
    }
  };

  const save = async () => {
    // Persist only non-empty overrides; empty means "use default".
    const clean = Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v && v.trim()),
    );
    await api.settings.set({ models: clean });
    await onSaved();
    setStatus('Models saved.');
  };

  const reset = async () => {
    setOverrides({});
    await api.settings.set({ models: {} });
    await onSaved();
    setStatus('Reset to defaults.');
  };

  return (
    <Card className="mt-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-medium">OpenAI Models</h3>
        <Button onClick={refreshList} loading={loadingList}>
          {available.length ? 'Refresh model list' : 'Load my models'}
        </Button>
      </div>
      <p className="mb-4 text-sm text-neutral-400">
        Choose a model per task, or leave blank to use the default. Pick from the dropdown or type a
        model id. “Load my models” fetches what your API key has access to.
      </p>

      <div className="space-y-4">
        {MODEL_FIELDS.map((f) => {
          const def = settings.modelDefaults?.[f.key] ?? '';
          return (
            <Field key={f.key} label={f.label} hint={`${f.hint} Default: ${def}`}>
              <TextInput
                list={`models-${f.key}`}
                value={overrides[f.key] ?? ''}
                placeholder={`Default (${def})`}
                onChange={(e) => setOverrides((o) => ({ ...o, [f.key]: e.target.value }))}
              />
              <datalist id={`models-${f.key}`}>
                {options[f.key].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={save}>
          Save models
        </Button>
        <Button variant="ghost" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
      {status && <p className="mt-3 text-sm text-neutral-300">{status}</p>}
    </Card>
  );
}
