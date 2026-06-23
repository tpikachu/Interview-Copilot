import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/ui';

export interface TourStep {
  /** value of a `data-tour="…"` attribute to spotlight; omit for a centered step */
  target?: string;
  title: string;
  body: string;
}

/** First-run walkthrough. Steps spotlight sidebar entries (always on-screen), so
 *  the tour works regardless of the current route. */
export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome 👋',
    body: 'A quick 30-second tour of how to go from résumé to live, grounded interview answers.',
  },
  {
    target: 'nav-settings',
    title: '1 · Add your OpenAI key',
    body: 'Everything runs on your own key. Paste it in Settings — it’s encrypted locally and never leaves your machine except to call OpenAI.',
  },
  {
    target: 'nav-profiles',
    title: '2 · Create your profile',
    body: 'A profile is just you: name, role, and résumé. You create it once and reuse it for every job you interview for.',
  },
  {
    target: 'nav-session',
    title: '3 · Set up the interview',
    body: 'In Live Session, add the job: paste the JD (or a link), and optionally a company website — we’ll research it so answers can speak to the company. Then go live.',
  },
  {
    target: 'nav-mock',
    title: 'Practice anytime',
    body: 'Mock Interview runs an AI interviewer that asks questions aloud and gives feedback — great for rehearsing.',
  },
  {
    title: 'The Cue Card',
    body: 'During a call, suggested answers stream into the Cue Card — a floating, always-on-top panel. It’s shown by default; toggle it with Ctrl+Shift+Space or from the tray. Privacy Mode keeps it hidden from screen sharing.',
  },
  {
    target: 'nav-reports',
    title: 'Review afterwards',
    body: 'After each session, generate a coaching report — strengths, improvements, and per-question notes — here in Reports.',
  },
  {
    title: 'You’re set 🚀',
    body: 'That’s the whole flow. You can replay this tour anytime from Settings → Getting started.',
  },
];

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[i];
  const last = i === steps.length - 1;

  // Locate the target element and reposition the card; recompute on resize.
  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target
        ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null)
        : null;
      const r = el?.getBoundingClientRect() ?? null;
      setRect(r);

      const card = cardRef.current;
      const cw = card?.offsetWidth ?? 320;
      const ch = card?.offsetHeight ?? 190;
      const m = 14;
      if (!r) {
        setPos({ top: (window.innerHeight - ch) / 2, left: (window.innerWidth - cw) / 2 });
        return;
      }
      // Prefer right of the target (sidebar is on the left); flip left if needed.
      let left = r.right + m;
      if (left + cw > window.innerWidth - m) left = r.left - cw - m;
      left = Math.max(m, Math.min(left, window.innerWidth - cw - m));
      let top = r.top;
      top = Math.max(m, Math.min(top, window.innerHeight - ch - m));
      setPos({ top, left });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [i, step.target]);

  const pad = 6;
  return (
    <div className="fixed inset-0 z-[60]">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-indigo-400 transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.66)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/66" />
      )}

      <div
        ref={cardRef}
        className="absolute w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="mb-1 text-xs text-neutral-500">
          Step {i + 1} of {steps.length}
        </div>
        <h3 className="mb-1.5 font-semibold text-neutral-100">{step.title}</h3>
        <p className="mb-4 text-sm leading-relaxed text-neutral-300">{step.body}</p>
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300">
            {last ? '' : 'Skip tour'}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="ghost" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button variant="primary" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
