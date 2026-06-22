import { z } from 'zod';
import { IPC } from '@shared/ipc';
import { handle, zId } from './helpers';
import { jobsRepo } from '../db/repositories/jobs.repo';
import { parseJobDescription } from '../services/openai/parsing';
import { indexJob } from '../services/rag/indexProfile';
import { apiKeyStore } from '../services/security/apiKey';

export function registerJobsIpc(): void {
  handle(IPC.jobs.list, z.object({ profileId: z.string().min(1) }), ({ profileId }) =>
    jobsRepo.list(profileId),
  );

  handle(IPC.jobs.get, zId, ({ id }) => {
    const job = jobsRepo.get(id);
    if (!job) throw new Error('Job not found');
    return job;
  });

  // Create (no id) or update (with id), then parse the JD + index it (if a key
  // is set). Each job is parsed independently of the resume and other jobs.
  handle(
    IPC.jobs.save,
    z.object({
      id: z.string().optional(),
      profileId: z.string().min(1),
      title: z.string().default(''),
      company: z.string().nullable().default(null),
      jdText: z.string().nullable().default(null),
    }),
    async ({ id, profileId, title, company, jdText }) => {
      const job = id
        ? jobsRepo.update(id, { title, company, jdText })
        : jobsRepo.create({ profileId, title, company, jdText });

      const hasKey = apiKeyStore.isPresent();
      if (hasKey && jdText?.trim()) {
        jobsRepo.update(job.id, { parsedJd: await parseJobDescription(jdText) });
      }
      const { embedded } = hasKey ? await indexJob(job.id) : { embedded: 0 };
      return { job: jobsRepo.get(job.id)!, keyMissing: !hasKey, embedded };
    },
  );

  handle(IPC.jobs.delete, zId, ({ id }) => {
    jobsRepo.delete(id);
    return { deleted: true as const };
  });
}
