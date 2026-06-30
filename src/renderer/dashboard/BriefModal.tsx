import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { InterviewBrief, Job } from '@shared/types';
import { Badge, Button, Modal, Spinner } from '../components/ui';

const COVERAGE: Record<string, { tone: 'green' | 'amber' | 'red'; label: string }> = {
  strong: { tone: 'green', label: 'strong' },
  partial: { tone: 'amber', label: 'partial' },
  missing: { tone: 'red', label: 'gap' },
};

/** A grounded pre-interview prep brief for one interview (job): likely questions,
 *  coverage gaps, strengths to lead with, and company angles. Generated on open
 *  from the profile's résumé × the job's JD × company research (main process). */
export function BriefModal({
  open,
  job,
  onClose,
}: {
  open: boolean;
  job: Job | null;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<InterviewBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (id: string) => {
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      setBrief(await api.jobs.brief(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Generate once when the modal opens for a job; reset when it closes.
  useEffect(() => {
    if (open && job) void generate(job.id);
    if (!open) {
      setBrief(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id]);

  return (
    <Modal open={open} onClose={onClose} title={`Prep brief — ${job?.title || 'Interview'}`}>
      {loading && (
        <div className="flex items-center gap-3 py-10 text-sm text-neutral-400">
          <Spinner className="h-4 w-4" />
          Analysing your résumé against this role…
        </div>
      )}

      {error && !loading && (
        <div className="space-y-3 py-6">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {error}
          </p>
          {job && (
            <Button variant="ghost" onClick={() => void generate(job.id)}>
              Try again
            </Button>
          )}
        </div>
      )}

      {brief && !loading && (
        <div className="space-y-6">
          {brief.summary && <p className="text-sm leading-relaxed text-neutral-300">{brief.summary}</p>}

          {brief.likelyQuestions.length > 0 && (
            <Section title="Likely questions" hint="Most probable first — rehearse these">
              <ol className="space-y-2.5">
                {brief.likelyQuestions.map((q, i) => (
                  <li key={i} className="text-sm">
                    <div className="text-neutral-100">
                      <span className="mr-1.5 text-neutral-500">{i + 1}.</span>
                      {q.question}
                    </div>
                    {q.why && <div className="ml-5 mt-0.5 text-xs text-neutral-500">{q.why}</div>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {brief.gaps.length > 0 && (
            <Section title="Coverage gaps" hint="Where the JD wants more than your résumé shows">
              <ul className="space-y-2.5">
                {brief.gaps.map((g, i) => {
                  const c = COVERAGE[g.coverage] ?? COVERAGE.partial;
                  return (
                    <li key={i} className="text-sm">
                      <div className="flex items-start gap-2">
                        <Badge tone={c.tone}>{c.label}</Badge>
                        <span className="text-neutral-100">{g.requirement}</span>
                      </div>
                      {g.howToAddress && (
                        <div className="ml-1 mt-0.5 text-xs text-neutral-500">→ {g.howToAddress}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {brief.strengths.length > 0 && (
            <Section title="Strengths to lead with" hint="Bring these up early">
              <ul className="space-y-2.5">
                {brief.strengths.map((s, i) => (
                  <li key={i} className="text-sm">
                    <div className="text-neutral-100">{s.point}</div>
                    {s.evidence && <div className="mt-0.5 text-xs text-neutral-500">{s.evidence}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief.companyAngles.length > 0 && (
            <Section title="Company angles" hint="Tailor your answers to them">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-300">
                {brief.companyAngles.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <p className="text-xs text-neutral-500">
              Grounded only in your résumé, this JD, and company research — nothing invented.
            </p>
            {job && (
              <Button variant="ghost" onClick={() => void generate(job.id)}>
                Regenerate
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-neutral-200">{title}</h4>
        {hint && <span className="text-xs text-neutral-600">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}
