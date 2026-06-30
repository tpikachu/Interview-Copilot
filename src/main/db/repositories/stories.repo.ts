import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../index';
import type { Story, StoryCompetency, StoryInput } from '@shared/types';

type Row = typeof schema.stories.$inferSelect;

function toStory(r: Row): Story {
  return {
    id: r.id,
    profileId: r.profileId,
    title: r.title,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    competencies: r.competencies ? (JSON.parse(r.competencies) as StoryCompetency[]) : [],
    skills: r.skills ? (JSON.parse(r.skills) as string[]) : [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Column values for inserting a story row. Exported so an atomic regenerate
 *  (stories + chunks + embeddings in one transaction) can reuse the mapping. */
export function storyInsertValues(id: string, input: StoryInput) {
  return {
    id,
    profileId: input.profileId,
    title: input.title,
    situation: input.situation,
    task: input.task,
    action: input.action,
    result: input.result,
    competencies: JSON.stringify(input.competencies),
    skills: JSON.stringify(input.skills),
  };
}

export const storiesRepo = {
  list(profileId: string): Story[] {
    return db()
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.profileId, profileId))
      .orderBy(desc(schema.stories.updatedAt))
      .all()
      .map(toStory);
  },

  get(id: string): Story | null {
    const r = db().select().from(schema.stories).where(eq(schema.stories.id, id)).get();
    return r ? toStory(r) : null;
  },

  create(input: StoryInput): Story {
    const id = crypto.randomUUID();
    db().insert(schema.stories).values(storyInsertValues(id, input)).run();
    return this.get(id)!;
  },

  update(id: string, patch: Partial<Story>): Story {
    const set: Record<string, unknown> = { updatedAt: Date.now() };
    const map: Record<string, unknown> = {
      title: patch.title,
      situation: patch.situation,
      task: patch.task,
      action: patch.action,
      result: patch.result,
    };
    for (const [k, v] of Object.entries(map)) if (v !== undefined) set[k] = v;
    if (patch.competencies !== undefined) set.competencies = JSON.stringify(patch.competencies);
    if (patch.skills !== undefined) set.skills = JSON.stringify(patch.skills);
    db().update(schema.stories).set(set).where(eq(schema.stories.id, id)).run();
    return this.get(id)!;
  },

  delete(id: string): void {
    db().delete(schema.stories).where(eq(schema.stories.id, id)).run();
  },
};
