import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { IPC } from '@shared/ipc';
import { handle, zId } from './helpers';
import { db, schema } from '../db';
import type { Note } from '@shared/types';

const toNote = (r: typeof schema.notes.$inferSelect): Note => ({
  id: r.id,
  profileId: r.profileId,
  content: r.content,
  createdAt: r.createdAt,
});

export function registerNotesIpc(): void {
  handle(IPC.notes.list, z.object({ profileId: z.string().min(1) }), ({ profileId }) =>
    db().select().from(schema.notes).where(eq(schema.notes.profileId, profileId)).all().map(toNote),
  );

  handle(
    IPC.notes.create,
    z.object({ profileId: z.string().min(1), content: z.string().min(1) }),
    ({ profileId, content }) => {
      const id = crypto.randomUUID();
      db().insert(schema.notes).values({ id, profileId, content }).run();
      return toNote(db().select().from(schema.notes).where(eq(schema.notes.id, id)).get()!);
    },
  );

  handle(IPC.notes.delete, zId, ({ id }) => {
    db().delete(schema.notes).where(eq(schema.notes.id, id)).run();
    return { deleted: true as const };
  });
}
