import { embedOne } from '../openai/embeddings';
import { sqliteVectorStore } from './vectorStore';
import type { RetrievedChunk } from '@shared/types';

/** Embed the query and return the top-k chunks for grounding: the profile's
 *  resume/notes plus, when given, the selected job's JD. */
export async function retrieve(
  profileId: string,
  query: string,
  k = 5,
  jobId: string | null = null,
): Promise<RetrievedChunk[]> {
  const vector = await embedOne(query);
  return sqliteVectorStore.search({ profileId, query: vector, k, jobId });
}
