import { z } from 'zod';
import { IPC } from '@shared/ipc';
import { handle } from './helpers';
import { mockManager } from '../services/mock/mockManager';
import { generateReport } from '../services/session/report';

const voice = z
  .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  .default('alloy');
const interviewType = z
  .enum(['behavioral', 'technical', 'coding', 'system_design', 'product', 'sales', 'general'])
  .default('general');

export function registerMockIpc(): void {
  handle(
    IPC.mock.start,
    z.object({
      profileId: z.string().min(1),
      voice,
      jobId: z.string().nullable().default(null),
      interviewType,
    }),
    ({ profileId, voice: v, jobId, interviewType: t }) =>
      mockManager.start(profileId, v, jobId, t),
  );

  handle(
    IPC.mock.answerText,
    z.object({ sessionId: z.string().min(1), text: z.string() }),
    ({ sessionId, text }) => mockManager.submitAnswer(sessionId, text),
  );

  handle(
    IPC.mock.answerAudio,
    z.object({
      sessionId: z.string().min(1),
      audio: z.instanceof(ArrayBuffer),
      mime: z.string().default('audio/webm'),
    }),
    ({ sessionId, audio, mime }) => mockManager.submitAudio(sessionId, audio, mime),
  );

  handle(IPC.mock.end, z.object({ sessionId: z.string().min(1) }), async ({ sessionId }) => {
    mockManager.end(sessionId);
    return generateReport(sessionId);
  });
}
