import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@shared/ipc';
import { api } from '../lib/api';

/** Slim banner under the titlebar: shows download progress and, once a new version
 *  is downloaded, a "Restart to update" prompt. Silent in every other state. */
export function UpdateBanner() {
  const [s, setS] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    void api.update.getStatus().then(setS);
    return api.events.onUpdateStatus(setS);
  }, []);

  if (!s) return null;

  if (s.state === 'downloaded') {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 bg-indigo-600 px-4 py-2 text-sm text-white">
        <span>
          🎉 BrainCue {s.version ? `v${s.version}` : 'update'} is ready to install.
        </span>
        <button
          type="button"
          onClick={() => void api.update.install()}
          className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/30"
        >
          Restart to update
        </button>
      </div>
    );
  }

  if (s.state === 'downloading') {
    return (
      <div className="shrink-0 bg-neutral-800 px-4 py-1.5 text-xs text-neutral-300">
        Downloading update{typeof s.percent === 'number' ? ` — ${s.percent}%` : '…'}
      </div>
    );
  }

  return null;
}
