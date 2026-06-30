import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Profile, Story, StoryCompetency } from '@shared/types';
import { Badge, Button, Field, Modal, Spinner, TextArea, TextInput } from '../components/ui';

const COMPETENCY_LABEL: Record<StoryCompetency, string> = {
  leadership: 'Leadership',
  teamwork: 'Teamwork',
  conflict: 'Conflict',
  failure: 'Failure',
  ambiguity: 'Ambiguity',
  impact: 'Impact',
  technical_depth: 'Technical depth',
  communication: 'Communication',
  ownership: 'Ownership',
  problem_solving: 'Problem-solving',
  growth: 'Growth',
  customer_focus: 'Customer focus',
};

type EditForm = Pick<Story, 'title' | 'situation' | 'task' | 'action' | 'result'>;

/** Per-profile STAR story bank: extract grounded stories from the résumé, browse,
 *  edit, regenerate, delete. Stories also ground live answers (indexed as sources). */
export function StoryBankModal({
  open,
  profile,
  keyPresent,
  onClose,
  onChanged,
}: {
  open: boolean;
  profile: Profile | null;
  keyPresent: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ title: '', situation: '', task: '', action: '', result: '' });
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canGenerate = keyPresent && !!profile?.parsedResume;

  useEffect(() => {
    if (!open) {
      // Fully reset so reopening is clean.
      setStories([]);
      setError(null);
      setExpandedId(null);
      setEditingId(null);
      setConfirmRegen(false);
      setConfirmDeleteId(null);
      return;
    }
    if (!profile) return;
    setLoading(true);
    setError(null);
    api.stories
      .list(profile.id)
      .then(setStories)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (msg: string, fn: () => Promise<void>) => {
    setBusy(msg);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doGenerate = () =>
    run('Extracting STAR stories from your résumé…', async () => {
      if (!profile) return;
      setStories(await api.stories.generate(profile.id));
      setConfirmRegen(false);
      setExpandedId(null);
      setEditingId(null);
      onChanged();
    });

  const startEdit = (s: Story) => {
    setEditingId(s.id);
    setExpandedId(s.id);
    setEditForm({ title: s.title, situation: s.situation, task: s.task, action: s.action, result: s.result });
  };

  const saveEdit = () =>
    run('Saving…', async () => {
      if (!editingId) return;
      const updated = await api.stories.update(editingId, editForm);
      setStories((ss) => ss.map((s) => (s.id === updated.id ? updated : s)));
      setEditingId(null);
      onChanged();
    });

  const doDelete = (id: string) =>
    run('Deleting…', async () => {
      await api.stories.delete(id);
      setStories((ss) => ss.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
      onChanged();
    });

  return (
    <Modal open={open} onClose={onClose} title="Story Bank" width="max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-neutral-400">
            Reusable STAR stories pulled from your résumé — rehearse them, and they’ll also ground
            your live answers (shown as 📖 sources in the Cue Card).
          </p>
          {stories.length > 0 && !confirmRegen && (
            <Button variant="ghost" disabled={!canGenerate || !!busy} onClick={() => setConfirmRegen(true)}>
              Regenerate
            </Button>
          )}
        </div>

        {!keyPresent && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            Add your OpenAI API key in Settings to generate stories.
          </p>
        )}
        {keyPresent && !profile?.parsedResume && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            Add &amp; parse a résumé on this profile first — stories are extracted from it.
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {confirmRegen && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <span>Replace all {stories.length} stories? Any edits you’ve made will be lost.</span>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={() => setConfirmRegen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void doGenerate()}>
                Replace
              </Button>
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-3 py-8 text-sm text-neutral-400">
            <Spinner className="h-4 w-4" />
            {busy}
          </div>
        )}

        {loading && !busy && (
          <div className="flex items-center gap-3 py-8 text-sm text-neutral-400">
            <Spinner className="h-4 w-4" />
            Loading stories…
          </div>
        )}

        {/* Empty state */}
        {!loading && !busy && stories.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-neutral-950/40 px-4 py-10 text-center">
            <p className="text-sm text-neutral-400">No stories yet.</p>
            <Button variant="primary" className="mt-3" disabled={!canGenerate} onClick={() => void doGenerate()}>
              Generate from résumé
            </Button>
          </div>
        )}

        {/* Story list */}
        {!busy && stories.length > 0 && (
          <ul className="space-y-2.5">
            {stories.map((s) => {
              const editing = editingId === s.id;
              const expanded = expandedId === s.id || editing;
              return (
                <li key={s.id} className="rounded-xl border border-white/10 bg-neutral-950/40 p-3">
                  {editing ? (
                    <div className="space-y-2.5">
                      <Field label="Title">
                        <TextInput
                          value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        />
                      </Field>
                      {(['situation', 'task', 'action', 'result'] as const).map((k) => (
                        <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                          <TextArea
                            rows={2}
                            value={editForm[k]}
                            onChange={(e) => setEditForm((f) => ({ ...f, [k]: e.target.value }))}
                          />
                        </Field>
                      ))}
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={() => void saveEdit()}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="flex w-full items-start justify-between gap-3 text-left"
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-neutral-100">{s.title || 'Untitled story'}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.competencies.map((c) => (
                              <Badge key={c} tone="blue">
                                {COMPETENCY_LABEL[c] ?? c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">{expanded ? '▲' : '▼'}</span>
                      </button>

                      {expanded && (
                        <div className="mt-2.5 space-y-1.5 text-sm">
                          {(['situation', 'task', 'action', 'result'] as const).map((k) => (
                            <p key={k} className="text-neutral-300">
                              <span className="font-semibold text-neutral-400">
                                {k[0].toUpperCase() + k.slice(1)}:
                              </span>{' '}
                              {s[k] || <span className="text-neutral-600">—</span>}
                            </p>
                          ))}
                          {s.skills.length > 0 && (
                            <p className="pt-0.5 text-xs text-neutral-500">Skills: {s.skills.join(', ')}</p>
                          )}
                          <div className="flex justify-end gap-2 pt-1">
                            {confirmDeleteId === s.id ? (
                              <>
                                <span className="self-center text-xs text-neutral-500">Delete this story?</span>
                                <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                                  Cancel
                                </Button>
                                <Button variant="danger" onClick={() => void doDelete(s.id)}>
                                  Delete
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" onClick={() => startEdit(s)}>
                                  Edit
                                </Button>
                                <Button variant="ghost" className="text-red-300" onClick={() => setConfirmDeleteId(s.id)}>
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
