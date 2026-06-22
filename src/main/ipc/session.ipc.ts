import { z } from 'zod';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { handle, zId } from './helpers';
import { sessionManager } from '../services/session/sessionManager';
import { sessionsRepo } from '../db/repositories/sessions.repo';
import { generateReport } from '../services/session/report';

const interviewType = z.enum([
  'behavioral',
  'technical',
  'coding',
  'system_design',
  'product',
  'sales',
  'general',
]);
const answerStyle = z.enum(['concise', 'detailed', 'star', 'technical', 'conversational']);

export function registerSessionIpc(): void {
  handle(
    IPC.session.start,
    z.object({
      profileId: z.string().min(1),
      interviewType,
      answerStyle: answerStyle.default('concise'),
      jobId: z.string().nullable().default(null),
    }),
    ({ profileId, interviewType: t, answerStyle: s, jobId }) =>
      sessionManager.start(profileId, t, s, jobId),
  );

  handle(IPC.session.stop, z.object({ sessionId: z.string().min(1) }), ({ sessionId }) =>
    sessionManager.stop(sessionId),
  );

  handle(
    IPC.session.togglePause,
    z.object({ sessionId: z.string().min(1) }),
    ({ sessionId }) => sessionManager.togglePause(sessionId),
  );

  handle(IPC.session.togglePauseActive, z.void(), () => sessionManager.togglePauseActive());

  handle(
    IPC.session.audioChunk,
    z.object({
      sessionId: z.string().min(1),
      audio: z.instanceof(ArrayBuffer),
      mime: z.string().default('audio/webm'),
    }),
    async ({ sessionId, audio, mime }) => {
      await sessionManager.ingestAudio(sessionId, audio, mime);
      return { accepted: true as const };
    },
  );

  // High-frequency streaming PCM audio: fire-and-forget (no Result envelope).
  ipcMain.on(IPC.session.realtimeAudio, (_e, payload: { sessionId: string; pcm: ArrayBuffer }) => {
    if (payload?.sessionId && payload.pcm) {
      sessionManager.feedRealtimeAudio(payload.sessionId, payload.pcm);
    }
  });

  handle(
    IPC.session.ask,
    z.object({ sessionId: z.string().min(1), questionText: z.string().min(1) }),
    ({ sessionId, questionText }) =>
      // fire-and-forget; answer streams over events
      sessionManager.answerQuestion(sessionId, questionText),
  );

  handle(IPC.session.list, z.void(), () => sessionsRepo.list());

  handle(IPC.session.get, zId, ({ id }) => {
    const detail = sessionsRepo.detail(id);
    if (!detail) throw new Error('Session not found');
    return detail;
  });

  handle(IPC.session.delete, zId, ({ id }) => {
    sessionsRepo.delete(id);
    return { deleted: true as const };
  });

  handle(
    IPC.session.generateReport,
    z.object({ sessionId: z.string().min(1) }),
    ({ sessionId }) => generateReport(sessionId),
  );

  handle(
    IPC.session.getReport,
    z.object({ sessionId: z.string().min(1) }),
    ({ sessionId }) => sessionsRepo.getReport(sessionId),
  );
}
