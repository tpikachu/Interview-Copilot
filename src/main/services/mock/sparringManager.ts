import { profilesRepo } from '../../db/repositories/profiles.repo';
import { jobsRepo } from '../../db/repositories/jobs.repo';
import { generateQuestion, type QaTurn } from '../openai/interviewer';
import { speak, type TtsVoice } from '../openai/tts';
import { transcribeChunk } from '../openai/transcription';
import { evaluateAnswer } from '../openai/feedback';
import { apiKeyStore } from '../security/apiKey';
import type { InterviewType, SparringFeedback } from '@shared/types';

const MAX_QUESTIONS = 6;

interface SparringState {
  id: string;
  profileId: string;
  jobId: string | null;
  interviewType: InterviewType;
  voice: TtsVoice;
  history: QaTurn[]; // each turn: { q, a } — a is filled in once the candidate answers
}

// One active Sparring round at a time (mirrors mockManager's single `mock`). Held
// in memory only — Sparring is an ephemeral drill, nothing is persisted.
let spar: SparringState | null = null;

/** Generate + speak the interviewer's next question, recording it in history. */
async function ask(): Promise<{ question: string; audioBase64: string }> {
  if (!spar) throw new Error('No active sparring session.');
  const profile = profilesRepo.get(spar.profileId);
  if (!profile) throw new Error('Profile not found.');
  const job = spar.jobId ? jobsRepo.get(spar.jobId) : null;

  const question = await generateQuestion(profile, spar.history, job, spar.interviewType);
  // Only commit the question to history AFTER TTS succeeds — a transient speak()
  // failure must not permanently consume a turn slot (which would skip questions,
  // end the round early, and pollute follow-up context with an unanswered turn).
  const audio = await speak(question, spar.voice);
  spar.history.push({ q: question, a: '' });
  return { question, audioBase64: audio.toString('base64') };
}

/** Decode base64 audio (from the renderer) into an ArrayBuffer for transcription. */
function decodeAudio(base64: string): ArrayBuffer {
  const buf = Buffer.from(base64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export const sparringManager = {
  /** Begin a two-way voice mock: ask the first question aloud. */
  async start(
    profileId: string,
    voice: TtsVoice,
    jobId: string | null = null,
    interviewType: InterviewType = 'general',
  ) {
    const profile = profilesRepo.get(profileId);
    if (!profile) throw new Error('Profile not found.');
    if (!apiKeyStore.isPresent())
      throw new Error('Add your OpenAI API key in Settings to start a sparring session.');

    spar = { id: crypto.randomUUID(), profileId, jobId, interviewType, voice, history: [] };
    const q = await ask();
    return { sessionId: spar.id, ...q, index: 1, total: MAX_QUESTIONS };
  },

  /** Transcribe the candidate's spoken answer to the current question and return
   *  coaching feedback. Records the answer in history so the next question can
   *  follow up on it. */
  async answer(
    sessionId: string,
    audioBase64: string,
    mime: string,
  ): Promise<{ transcript: string; feedback: SparringFeedback }> {
    if (!spar || spar.id !== sessionId) throw new Error('No active sparring session.');
    const current = spar.history[spar.history.length - 1];
    if (!current) throw new Error('No question to answer yet.');

    const profile = profilesRepo.get(spar.profileId);
    if (!profile) throw new Error('Profile not found.');
    const job = spar.jobId ? jobsRepo.get(spar.jobId) : null;

    const transcript = (await transcribeChunk(decodeAudio(audioBase64), mime)).trim();
    current.a = transcript;
    const feedback = await evaluateAnswer({
      question: current.q,
      answer: transcript,
      profile,
      job,
      interviewType: spar.interviewType,
    });
    return { transcript, feedback };
  },

  /** Ask the next question (history-aware, so it can follow up) or signal done. */
  async next(sessionId: string) {
    if (!spar || spar.id !== sessionId) throw new Error('No active sparring session.');
    if (spar.history.length >= MAX_QUESTIONS) {
      return { done: true as const, index: spar.history.length, total: MAX_QUESTIONS };
    }
    const q = await ask();
    return { done: false as const, ...q, index: spar.history.length, total: MAX_QUESTIONS };
  },

  end(sessionId: string) {
    if (spar?.id === sessionId) spar = null;
  },
};
