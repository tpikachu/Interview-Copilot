import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useProfileStore } from '../../store/useProfileStore';
import { useMicCapture, type AudioSource } from '../../lib/useMicCapture';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { AnswerStyle, InterviewType, Job, Session } from '@shared/types';
import { Badge, Button, Card, Field, Page, Select, TextArea, TextInput } from '../../components/ui';
import { Waveform } from '../../components/Waveform';

const interviewTypes: InterviewType[] = [
  'behavioral',
  'technical',
  'coding',
  'system_design',
  'product',
  'sales',
  'general',
];
const answerStyles: AnswerStyle[] = ['concise', 'detailed', 'star', 'technical', 'conversational'];

interface Line {
  speaker: string;
  text: string;
}

export default function SessionPage() {
  const { profiles, load } = useProfileStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const mic = useMicCapture();

  const [profileId, setProfileId] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState('');
  const [newJob, setNewJob] = useState({ title: '', company: '', jdText: '' });
  const [showNewJob, setShowNewJob] = useState(false);
  const [savingJob, setSavingJob] = useState(false);

  const [interviewType, setInterviewType] = useState<InterviewType>('behavioral');
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>('concise');
  const [source, setSource] = useState<AudioSource>('system');

  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [interim, setInterim] = useState('');
  const [ask, setAsk] = useState('');
  const unsub = useRef<(() => void)[]>([]);

  useEffect(() => {
    void load();
    void loadSettings();
  }, [load, loadSettings]);

  useEffect(() => {
    unsub.current.push(
      api.events.onTranscriptDelta((p) => {
        const d = p as { text: string; speaker: string; isFinal: boolean };
        if (d.isFinal) {
          setTranscript((t) => [...t, { speaker: d.speaker, text: d.text }]);
          setInterim('');
        } else setInterim((prev) => prev + d.text);
      }),
      api.events.onQuestionDetected((p) => {
        const d = p as { text: string };
        setTranscript((t) => [...t, { speaker: 'detected question', text: d.text }]);
      }),
      api.events.onSessionState((p) => setPaused((p as { paused: boolean }).paused)),
    );
    return () => unsub.current.forEach((u) => u());
  }, []);

  const refreshJobs = async (pid: string) => setJobs((await api.jobs.list(pid)) as Job[]);

  useEffect(() => {
    setJobId('');
    setShowNewJob(false);
    if (!profileId) {
      setJobs([]);
      return;
    }
    void refreshJobs(profileId);
  }, [profileId]);

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const selectedJob = jobs.find((j) => j.id === jobId);
  const canStart =
    !!profileId && !!jobId && !!settings?.apiKeyPresent && !!selectedProfile?.parsedResume;

  const saveJob = async () => {
    if (!profileId || (!newJob.title.trim() && !newJob.jdText.trim())) return;
    setSavingJob(true);
    try {
      const res = (await api.jobs.save({
        profileId,
        title: newJob.title.trim() || 'Untitled role',
        company: newJob.company.trim() || null,
        jdText: newJob.jdText.trim() || null,
      })) as { job: Job };
      await refreshJobs(profileId);
      setJobId(res.job.id);
      setNewJob({ title: '', company: '', jdText: '' });
      setShowNewJob(false);
    } finally {
      setSavingJob(false);
    }
  };

  const uploadJd = async () => {
    const { filePath } = await api.dialog.openFile();
    if (!filePath) return;
    const { text } = await api.documents.extractFile(filePath);
    setNewJob((j) => ({ ...j, jdText: text }));
  };

  const deleteJob = async (id: string) => {
    await api.jobs.delete(id);
    if (jobId === id) setJobId('');
    await refreshJobs(profileId);
  };

  const start = async () => {
    if (!canStart) return;
    const s = (await api.session.start(profileId, interviewType, answerStyle, jobId)) as Session;
    setSession(s);
    setTranscript([]);
    setInterim('');
    await mic.start(s.id, source);
  };

  const stop = async () => {
    if (!session) return;
    mic.stop();
    await api.session.stop(session.id);
    setSession(null);
    setInterim('');
  };

  const sendAsk = async () => {
    if (!session || !ask) return;
    await api.session.ask(session.id, ask);
    setTranscript((t) => [...t, { speaker: 'you (manual)', text: ask }]);
    setAsk('');
  };

  return (
    <Page
      title="Live Session"
      subtitle="Pick a profile and an interview (JD), choose this round’s type, then go live."
      actions={
        <div className="flex gap-2">
            <Button
              onClick={() => api.capture.quickSolve()}
              title="Copy the problem text, then click (or Ctrl+Shift+Enter)"
            >
              ⚡ Solve from clipboard
            </Button>
            <Button variant="ghost" onClick={() => api.capture.openSelector()} title="Ctrl+Shift+S">
              📐 Select region
            </Button>
          </div>
      }
    >
      {!session ? (
        <div className="space-y-5">
          {/* Profile */}
          <Card>
            <Field label="Profile">
              <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">Select a profile…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.targetRole ? ` · ${p.targetRole}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedProfile && !selectedProfile.parsedResume && (
              <p className="mt-2 text-xs text-amber-400">
                ⚠ This profile has no parsed resume —{' '}
                <Link to={`/profiles/${selectedProfile.id}`} className="underline">
                  add & parse a resume
                </Link>
                .
              </p>
            )}
            {!settings?.apiKeyPresent && (
              <p className="mt-2 text-xs text-amber-400">
                ⚠ No OpenAI key —{' '}
                <Link to="/settings" className="underline">
                  add it in Settings
                </Link>
                .
              </p>
            )}
          </Card>

          {/* Interviews (jobs) */}
          {profileId && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium">Interview (job)</h3>
                <Button variant="ghost" onClick={() => setShowNewJob((v) => !v)}>
                  {showNewJob ? 'Cancel' : '+ New interview'}
                </Button>
              </div>

              {jobs.length === 0 && !showNewJob && (
                <p className="text-sm text-neutral-500">
                  No interviews yet. Create one with a job description — it’s saved and reused for
                  every round of that job.
                </p>
              )}

              {jobs.length > 0 && (
                <div className="space-y-2">
                  {jobs.map((j) => (
                    <label
                      key={j.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                        jobId === j.id
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="job"
                          checked={jobId === j.id}
                          onChange={() => setJobId(j.id)}
                          className="accent-indigo-500"
                        />
                        <div>
                          <div className="font-medium">
                            {j.title || 'Untitled role'}
                            {j.company ? ` · ${j.company}` : ''}
                          </div>
                          {j.parsedJd ? (
                            <Badge tone="green">JD parsed ✓</Badge>
                          ) : (
                            <Badge tone="amber">no JD</Badge>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          void deleteJob(j.id);
                        }}
                        className="text-xs text-red-300 hover:text-red-200"
                      >
                        delete
                      </button>
                    </label>
                  ))}
                </div>
              )}

              {showNewJob && (
                <div className="mt-3 space-y-3 rounded-lg border border-neutral-800 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Interview name / role">
                      <TextInput
                        value={newJob.title}
                        onChange={(e) => setNewJob((j) => ({ ...j, title: e.target.value }))}
                        placeholder="e.g. Acme — Senior PM"
                      />
                    </Field>
                    <Field label="Company">
                      <TextInput
                        value={newJob.company}
                        onChange={(e) => setNewJob((j) => ({ ...j, company: e.target.value }))}
                        placeholder="e.g. Acme"
                      />
                    </Field>
                  </div>
                  <Button variant="default" onClick={uploadJd}>
                    ⬆ Upload JD file
                  </Button>
                  <Field label="Job description (parsed for grounding)">
                    <TextArea
                      rows={6}
                      value={newJob.jdText}
                      onChange={(e) => setNewJob((j) => ({ ...j, jdText: e.target.value }))}
                      placeholder="Paste the job description"
                    />
                  </Field>
                  <Button variant="primary" onClick={saveJob} loading={savingJob}>
                    Save interview
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* This round */}
          {jobId && (
            <Card>
              <h3 className="mb-3 font-medium">This round</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Interview type" hint="intro, technical, panel, behavioral…">
                  <Select value={interviewType} onChange={(e) => setInterviewType(e.target.value as InterviewType)}>
                    {interviewTypes.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Answer style">
                  <Select value={answerStyle} onChange={(e) => setAnswerStyle(e.target.value as AnswerStyle)}>
                    {answerStyles.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Listen to"
                  hint={
                    source === 'system'
                      ? 'the interviewer’s voice from your speakers (online calls)'
                      : 'your microphone (in-person rooms)'
                  }
                >
                  <Select value={source} onChange={(e) => setSource(e.target.value as AudioSource)}>
                    <option value="system">Interviewer (system audio)</option>
                    <option value="mic">Microphone (in-person)</option>
                  </Select>
                </Field>
              </div>
              <Button variant="success" className="mt-4" onClick={start} disabled={!canStart}>
                ● Start session
              </Button>
              {selectedJob && (
                <p className="mt-2 text-xs text-neutral-500">
                  Answers will be grounded in your resume + “{selectedJob.title}”.
                </p>
              )}
            </Card>
          )}
        </div>
      ) : (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={mic.speaking ? 'green' : mic.recording ? 'blue' : 'neutral'}>
                {mic.speaking ? '● speaking' : mic.recording ? 'listening…' : 'live'}
              </Badge>
              {paused && <Badge tone="amber">paused</Badge>}
              <Button onClick={() => api.session.togglePause(session.id)}>
                {paused ? 'Resume AI' : 'Pause AI'}
              </Button>
              <Button variant="danger" onClick={stop}>
                Stop
              </Button>
              <span className="text-xs text-neutral-500">Answers stream to the overlay.</span>
            </div>
            {mic.error && <p className="mt-2 text-xs text-red-400">Mic error: {mic.error}</p>}
            {mic.stream && (
              <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/60 p-2">
                <Waveform stream={mic.stream} className="h-12 w-full" />
              </div>
            )}
          </Card>

          <div className="mb-5 flex gap-2">
            <TextInput
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendAsk()}
              placeholder="Type a question to test grounded answering…"
            />
            <Button variant="primary" onClick={sendAsk}>
              Ask
            </Button>
          </div>

          <Card className="min-h-[220px]">
            <h3 className="mb-3 text-sm font-medium text-neutral-400">Transcript</h3>
            {transcript.length === 0 && !interim ? (
              <p className="text-sm text-neutral-500">
                Transcript appears here as audio is transcribed. Answers stream to the overlay.
              </p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {transcript.map((l, i) => (
                  <p key={i}>
                    <span className="text-neutral-500">{l.speaker}: </span>
                    {l.text}
                  </p>
                ))}
                {interim && (
                  <p className="italic text-neutral-500">
                    interviewer: {interim}
                    <span className="ml-0.5 animate-pulse">▋</span>
                  </p>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
