import { z } from 'zod';
import { IPC } from '@shared/ipc';
import { handle } from './helpers';
import { extractText } from '../services/documents/extract';
import { fetchUrlText } from '../services/documents/fetchUrl';
import { parseResume } from '../services/openai/parsing';
import { reindexProfile } from '../services/rag/indexProfile';
import { profilesRepo } from '../db/repositories/profiles.repo';
import { apiKeyStore } from '../services/security/apiKey';

export function registerDocumentsIpc(): void {
  // Extract text from a file WITHOUT persisting — used to populate the editor's
  // text box so the user reviews before saving.
  handle(
    IPC.documents.extractFile,
    z.object({ filePath: z.string().min(1) }),
    async ({ filePath }) => {
      const { text, mime } = await extractText(filePath);
      const filename = filePath.split(/[\\/]/).pop() ?? 'document';
      return { text, mime, filename };
    },
  );

  // Best-effort: download a (job-posting) URL and return its readable text so
  // the user can review it before saving. Nothing is persisted here.
  handle(
    IPC.documents.fetchUrl,
    z.object({ url: z.string().min(1) }),
    ({ url }) => fetchUrlText(url),
  );

  // Save the resume text and (when a key exists) parse it + reindex the profile
  // base (resume + notes). JD lives on jobs and is parsed independently.
  handle(
    IPC.documents.saveResume,
    z.object({ profileId: z.string().min(1), resumeText: z.string() }),
    async ({ profileId, resumeText }) => {
      profilesRepo.update(profileId, { resumeText });
      const hasKey = apiKeyStore.isPresent();
      if (hasKey && resumeText.trim()) {
        profilesRepo.update(profileId, { parsedResume: await parseResume(resumeText) });
      }
      const { embedded } = hasKey ? await reindexProfile(profileId) : { embedded: 0 };
      return { keyMissing: !hasKey, parsed: hasKey && !!resumeText.trim(), embedded };
    },
  );

  handle(
    IPC.documents.reindexProfile,
    z.object({ profileId: z.string().min(1) }),
    ({ profileId }) => reindexProfile(profileId),
  );
}
