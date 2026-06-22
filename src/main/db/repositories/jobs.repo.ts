import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../index';
import type { Job } from '@shared/types';

type Row = typeof schema.jobs.$inferSelect;

function toJob(r: Row): Job {
  return {
    id: r.id,
    profileId: r.profileId,
    title: r.title,
    company: r.company,
    jdText: r.jdText,
    parsedJd: r.parsedJd ? JSON.parse(r.parsedJd) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const jobsRepo = {
  list(profileId: string): Job[] {
    return db()
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.profileId, profileId))
      .orderBy(desc(schema.jobs.updatedAt))
      .all()
      .map(toJob);
  },

  get(id: string): Job | null {
    const r = db().select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
    return r ? toJob(r) : null;
  },

  create(input: { profileId: string; title: string; company: string | null; jdText: string | null }): Job {
    const id = crypto.randomUUID();
    db()
      .insert(schema.jobs)
      .values({
        id,
        profileId: input.profileId,
        title: input.title,
        company: input.company,
        jdText: input.jdText,
      })
      .run();
    return this.get(id)!;
  },

  update(id: string, patch: Partial<Job>): Job {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.company !== undefined) set.company = patch.company;
    if (patch.jdText !== undefined) set.jdText = patch.jdText;
    if (patch.parsedJd !== undefined)
      set.parsedJd = patch.parsedJd ? JSON.stringify(patch.parsedJd) : null;
    db().update(schema.jobs).set(set).where(eq(schema.jobs.id, id)).run();
    return this.get(id)!;
  },

  delete(id: string): void {
    db().delete(schema.jobs).where(eq(schema.jobs.id, id)).run();
  },
};
