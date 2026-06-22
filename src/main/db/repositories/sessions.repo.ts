import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../index';
import type {
  AiAnswer,
  DetectedQuestion,
  Session,
  SessionDetail,
  SessionListItem,
  SessionReport,
  TranscriptChunk,
} from '@shared/types';

const toSession = (r: typeof schema.sessions.$inferSelect): Session => ({
  id: r.id,
  profileId: r.profileId,
  jobId: r.jobId,
  interviewType: r.interviewType as Session['interviewType'],
  status: r.status as Session['status'],
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  createdAt: r.createdAt,
});

const toAnswer = (r: typeof schema.aiAnswers.$inferSelect): AiAnswer => ({
  id: r.id,
  questionId: r.questionId,
  directAnswer: r.directAnswer,
  talkingPoints: r.talkingPoints ? JSON.parse(r.talkingPoints) : [],
  resumeMatch: r.resumeMatch,
  star: r.star ? JSON.parse(r.star) : null,
  clarifyingQuestion: r.clarifyingQuestion,
  riskWarning: r.riskWarning,
  followupQuestion: r.followupQuestion,
  model: r.model,
  tokens: r.tokens ? JSON.parse(r.tokens) : null,
  createdAt: r.createdAt,
});

const toReport = (r: typeof schema.sessionReports.$inferSelect): SessionReport => ({
  id: r.id,
  sessionId: r.sessionId,
  summary: r.summary,
  strengths: r.strengths ? JSON.parse(r.strengths) : [],
  improvements: r.improvements ? JSON.parse(r.improvements) : [],
  perQuestion: r.perQuestion ? JSON.parse(r.perQuestion) : [],
  createdAt: r.createdAt,
});

export const sessionsRepo = {
  /** Sessions with job (title/company) + profile name, newest first. */
  list(): SessionListItem[] {
    return db()
      .select({
        id: schema.sessions.id,
        profileId: schema.sessions.profileId,
        jobId: schema.sessions.jobId,
        interviewType: schema.sessions.interviewType,
        status: schema.sessions.status,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
        createdAt: schema.sessions.createdAt,
        jobTitle: schema.jobs.title,
        jobCompany: schema.jobs.company,
        profileName: schema.profiles.name,
      })
      .from(schema.sessions)
      .leftJoin(schema.jobs, eq(schema.jobs.id, schema.sessions.jobId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.sessions.profileId))
      .orderBy(desc(schema.sessions.createdAt))
      .all()
      .map((r) => ({
        id: r.id,
        profileId: r.profileId,
        jobId: r.jobId,
        interviewType: r.interviewType as Session['interviewType'],
        status: r.status as Session['status'],
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        createdAt: r.createdAt,
        jobTitle: r.jobTitle ?? null,
        jobCompany: r.jobCompany ?? null,
        profileName: r.profileName ?? null,
      }));
  },

  detail(id: string): SessionDetail | null {
    const s = db().select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!s) return null;

    const transcript = db()
      .select()
      .from(schema.transcriptChunks)
      .where(eq(schema.transcriptChunks.sessionId, id))
      .all()
      .map<TranscriptChunk>((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        speaker: r.speaker as TranscriptChunk['speaker'],
        text: r.text,
        isFinal: !!r.isFinal,
        tStart: r.tStart,
        tEnd: r.tEnd,
        createdAt: r.createdAt,
      }));

    const questions = db()
      .select()
      .from(schema.detectedQuestions)
      .where(eq(schema.detectedQuestions.sessionId, id))
      .all()
      .map((q) => {
        const a = db()
          .select()
          .from(schema.aiAnswers)
          .where(eq(schema.aiAnswers.questionId, q.id))
          .get();
        const question: DetectedQuestion = {
          id: q.id,
          sessionId: q.sessionId,
          text: q.text,
          type: q.type as DetectedQuestion['type'],
          confidence: q.confidence,
          strategy: q.strategy,
          createdAt: q.createdAt,
        };
        return { ...question, answer: a ? toAnswer(a) : null };
      });

    const reportRow = db()
      .select()
      .from(schema.sessionReports)
      .where(eq(schema.sessionReports.sessionId, id))
      .get();

    return {
      ...toSession(s),
      transcript,
      questions,
      report: reportRow ? toReport(reportRow) : null,
    };
  },

  getReport(sessionId: string): SessionReport | null {
    const r = db()
      .select()
      .from(schema.sessionReports)
      .where(eq(schema.sessionReports.sessionId, sessionId))
      .get();
    return r ? toReport(r) : null;
  },

  saveReport(report: Omit<SessionReport, 'id' | 'createdAt'>): SessionReport {
    const id = crypto.randomUUID();
    db()
      .insert(schema.sessionReports)
      .values({
        id,
        sessionId: report.sessionId,
        summary: report.summary,
        strengths: JSON.stringify(report.strengths),
        improvements: JSON.stringify(report.improvements),
        perQuestion: JSON.stringify(report.perQuestion),
      })
      .onConflictDoUpdate({
        target: schema.sessionReports.sessionId,
        set: {
          summary: report.summary,
          strengths: JSON.stringify(report.strengths),
          improvements: JSON.stringify(report.improvements),
          perQuestion: JSON.stringify(report.perQuestion),
        },
      })
      .run();
    return this.getReport(report.sessionId)!;
  },

  delete(id: string): void {
    db().delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
  },
};
