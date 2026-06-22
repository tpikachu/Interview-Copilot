import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { profilesRepo } from '../../db/repositories/profiles.repo';
import { jobsRepo } from '../../db/repositories/jobs.repo';
import { generateQuestion, type QaTurn } from '../openai/interviewer';
import { transcribeChunk } from '../openai/transcription';
import { speak, type TtsVoice } from '../openai/tts';
import type { InterviewType, Session } from '@shared/types';

const MAX_QUESTIONS = 6;

interface MockState {
  sessionId: string;
  profileId: string;
  jobId: string | null;
  interviewType: InterviewType;
  voice: TtsVoice;
  history: QaTurn[];
  lastQuestionId: string | null;
  lastQuestion: string;
}

let mock: MockState | null = null;

function toSession(r: typeof schema.sessions.$inferSelect): Session {
  return {
    id: r.id,
    profileId: r.profileId,
    jobId: r.jobId,
    interviewType: r.interviewType as Session['interviewType'],
    status: r.status as Session['status'],
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    createdAt: r.createdAt,
  };
}

async function askNext(): Promise<{ question: string; questionId: string; audioBase64: string }> {
  if (!mock) throw new Error('No active mock interview');
  const profile = profilesRepo.get(mock.profileId);
  if (!profile) throw new Error('Profile not found');
  const job = mock.jobId ? jobsRepo.get(mock.jobId) : null;

  const question = await generateQuestion(profile, mock.history, job, mock.interviewType);
  const questionId = crypto.randomUUID();
  db()
    .insert(schema.detectedQuestions)
    .values({
      id: questionId,
      sessionId: mock.sessionId,
      text: question,
      type: 'behavioral',
      confidence: 1,
      strategy: 'mock-interview',
    })
    .run();
  // Record the question in the transcript as the interviewer speaking.
  db()
    .insert(schema.transcriptChunks)
    .values({
      id: crypto.randomUUID(),
      sessionId: mock.sessionId,
      speaker: 'interviewer',
      text: question,
      isFinal: 1,
    })
    .run();

  mock.lastQuestionId = questionId;
  mock.lastQuestion = question;

  const audio = await speak(question, mock.voice);
  return { question, questionId, audioBase64: audio.toString('base64') };
}

export const mockManager = {
  async start(
    profileId: string,
    voice: TtsVoice,
    jobId: string | null = null,
    interviewType: InterviewType = 'general',
  ) {
    if (!profilesRepo.get(profileId)) throw new Error('Profile not found');
    const id = crypto.randomUUID();
    db()
      .insert(schema.sessions)
      .values({ id, profileId, jobId, interviewType, status: 'live', startedAt: Date.now() })
      .run();
    mock = {
      sessionId: id,
      profileId,
      jobId,
      interviewType,
      voice,
      history: [],
      lastQuestionId: null,
      lastQuestion: '',
    };

    const q = await askNext();
    const session = toSession(
      db().select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()!,
    );
    return { session, ...q, index: 1, total: MAX_QUESTIONS };
  },

  /** Record the candidate's answer (text), then either ask the next question or finish. */
  async submitAnswer(sessionId: string, answerText: string) {
    if (!mock || mock.sessionId !== sessionId) throw new Error('No active mock interview');

    if (mock.lastQuestionId) {
      db()
        .insert(schema.aiAnswers)
        .values({
          id: crypto.randomUUID(),
          questionId: mock.lastQuestionId,
          directAnswer: answerText, // the CANDIDATE's answer, evaluated in the report
          model: 'candidate',
        })
        .run();
      db()
        .insert(schema.transcriptChunks)
        .values({
          id: crypto.randomUUID(),
          sessionId,
          speaker: 'candidate',
          text: answerText,
          isFinal: 1,
        })
        .run();
    }
    mock.history.push({ q: mock.lastQuestion, a: answerText });

    if (mock.history.length >= MAX_QUESTIONS) {
      return { done: true as const, index: mock.history.length, total: MAX_QUESTIONS };
    }
    const next = await askNext();
    return { done: false as const, ...next, index: mock.history.length + 1, total: MAX_QUESTIONS };
  },

  /** Transcribe an audio answer, then proceed. Returns the transcript too. */
  async submitAudio(sessionId: string, audio: ArrayBuffer, mime: string) {
    const text = (await transcribeChunk(audio, mime)).trim();
    const res = await this.submitAnswer(sessionId, text || '(no answer captured)');
    return { transcript: text, ...res };
  },

  end(sessionId: string) {
    db()
      .update(schema.sessions)
      .set({ status: 'stopped', endedAt: Date.now() })
      .where(eq(schema.sessions.id, sessionId))
      .run();
    if (mock?.sessionId === sessionId) mock = null;
  },
};
