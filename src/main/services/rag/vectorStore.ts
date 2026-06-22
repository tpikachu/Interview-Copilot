import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { bufferToVector, cosineSimilarity, vectorToBuffer } from './vectorMath';
import type { ChunkSource, RetrievedChunk } from '@shared/types';

/**
 * VectorStore interface so the backend can be swapped (SQLite cosine -> LanceDB
 * or sqlite-vec) without touching callers. MVP impl: brute-force cosine over
 * embeddings stored as BLOBs in SQLite, filtered by profile.
 */
export interface VectorStore {
  upsert(args: {
    chunkId: string;
    model: string;
    vector: Float32Array;
  }): void;
  search(args: {
    profileId: string;
    query: Float32Array;
    k: number;
    jobId?: string | null;
  }): RetrievedChunk[];
}

export const sqliteVectorStore: VectorStore = {
  upsert({ chunkId, model, vector }) {
    db()
      .insert(schema.embeddings)
      .values({
        id: crypto.randomUUID(),
        chunkId,
        model,
        dim: vector.length,
        vector: vectorToBuffer(vector),
      })
      .onConflictDoUpdate({
        target: schema.embeddings.chunkId,
        set: { model, dim: vector.length, vector: vectorToBuffer(vector) },
      })
      .run();
  },

  search({ profileId, query, k, jobId }) {
    // Join chunks (for the profile) with their embeddings, score in-process.
    const rows = db()
      .select({
        id: schema.chunks.id,
        jobId: schema.chunks.jobId,
        sourceType: schema.chunks.sourceType,
        content: schema.chunks.content,
        vector: schema.embeddings.vector,
      })
      .from(schema.chunks)
      .innerJoin(schema.embeddings, eq(schema.embeddings.chunkId, schema.chunks.id))
      .where(eq(schema.chunks.profileId, profileId))
      .all()
      // Always include base chunks (resume/notes, jobId null); include JD chunks
      // only for the selected job.
      .filter((r) => r.jobId == null || r.jobId === jobId);

    return rows
      .map((r) => ({
        id: r.id,
        sourceType: r.sourceType as ChunkSource,
        content: r.content,
        score: cosineSimilarity(query, bufferToVector(r.vector as Buffer)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  },
};
