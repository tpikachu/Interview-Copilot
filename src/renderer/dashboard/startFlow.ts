import { FLAGS } from '@shared/flags';
import type { Profile } from '@shared/types';

/** The universal start flow's mode catalog (StartSessionModal + Home). One
 *  entry per SessionMode; `enabled` is the flag gate — a disabled mode is
 *  hidden from pickers, never rendered as a dead option. */
export interface StartMode {
  id: 'interview' | 'practice' | 'interviewer_assist' | 'meeting' | 'tutor' | 'companion';
  label: string;
  desc: string;
  enabled: boolean;
}

export const START_MODES: StartMode[] = [
  {
    id: 'interview',
    label: 'Interview Copilot',
    desc: 'You answer — grounded cues stream into the Cue Card.',
    enabled: true,
  },
  {
    id: 'practice',
    label: 'Practice',
    desc: 'Rehearse aloud with an AI interviewer + coaching.',
    enabled: true,
  },
  {
    id: 'interviewer_assist',
    label: 'Interviewer Assist',
    desc: 'You ask — suggestions, coverage, evaluation draft.',
    enabled: FLAGS.interviewerAssist,
  },
  {
    id: 'meeting',
    label: 'Meeting Copilot',
    desc: 'Quiet ambient context, open questions, action items.',
    enabled: FLAGS.meeting,
  },
  { id: 'tutor', label: 'Tutor', desc: 'Dialogue + drills over your material.', enabled: FLAGS.tutor },
  {
    id: 'companion',
    label: 'Companion',
    desc: 'Ambient presence with memory while you work.',
    enabled: FLAGS.companion,
  },
];

export const enabledModes = (): StartMode[] => START_MODES.filter((m) => m.enabled);

/** Can a session start? Returns the FIRST blocking reason so the UI can say
 *  exactly what to fix (and never half-starts anything). */
export function startBlocker(a: {
  profile: Profile | undefined;
  apiKeyPresent: boolean;
  sessionLive: boolean;
}): string | null {
  if (a.sessionLive) return 'A session is already live — stop it first.';
  if (!a.apiKeyPresent) return 'Add your OpenAI API key in Settings.';
  if (!a.profile) return 'Pick a profile.';
  if (!a.profile.parsedResume) return 'This profile has no parsed résumé — add one in the Library.';
  return null;
}

/** The transparency summary shown before Start: exactly what is captured
 *  locally and what leaves the machine. Mirrors the PRD privacy contract —
 *  keep the strings honest when the pipeline changes. */
export function captureSummary(a: {
  source: 'system' | 'mic';
  spaceTitle: string | null;
}): { captured: string[]; sent: string[]; neverSent: string[] } {
  return {
    captured: [
      a.source === 'system'
        ? 'System audio (the other side of your call), transcribed in real time.'
        : 'Your microphone, transcribed in real time.',
      'The transcript stays in the local database on this machine.',
    ],
    sent: [
      'Audio to OpenAI for transcription (Realtime API, your key).',
      `Per detected question: the question text + the top-5 matching chunks from ${
        a.spaceTitle ? `your profile and the “${a.spaceTitle}” Space` : 'your profile'
      }.`,
    ],
    neverSent: [
      'Your API key (main process only).',
      'Your full résumé or documents — only the retrieved chunks above.',
      'Your screen (unless you explicitly capture a region to solve).',
    ],
  };
}
