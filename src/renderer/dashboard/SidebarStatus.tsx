import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { UserIcon, MicIcon } from '../components/icons';
import { APP_VERSION } from './changelog';

interface Stats {
  profiles: number;
  sessions: number;
  liveSessions: number;
}

/** Live status block at the bottom of the dashboard sidebar: profile/session
 *  counts, an "active session" indicator, and the changelog link. Refreshes on
 *  session-state changes, data wipes, and when the window regains focus. */
export function SidebarStatus() {
  const [stats, setStats] = useState<Stats | null>(null);

  const refresh = useCallback(() => {
    void api.data.stats().then(setStats);
  }, []);

  useEffect(() => {
    refresh();
    const offState = api.events.onSessionState(refresh);
    const offData = api.events.onDataChanged(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      offState();
      offData();
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const live = (stats?.liveSessions ?? 0) > 0;

  return (
    <div className="mt-auto space-y-2">
      <div className="rounded-xl border border-white/5 bg-neutral-950/50 p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <span className={`relative flex h-2 w-2 ${live ? '' : 'opacity-60'}`}>
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                live ? 'bg-green-400' : 'bg-neutral-600'
              }`}
            />
          </span>
          <span className="text-xs font-medium text-neutral-300">
            {live ? 'Live session active' : 'Idle'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat icon={<UserIcon className="h-3.5 w-3.5" />} label="Profiles" value={stats?.profiles} />
          <Stat icon={<MicIcon className="h-3.5 w-3.5" />} label="Sessions" value={stats?.sessions} />
        </div>
      </div>

      <NavLink
        to="/whats-new"
        className={({ isActive }) =>
          `block rounded-md px-2 py-1 text-center text-[11px] transition-colors ${
            isActive ? 'text-indigo-300' : 'text-neutral-600 hover:text-neutral-400'
          }`
        }
      >
        v{APP_VERSION} · What's new
      </NavLink>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <div className="rounded-lg bg-white/5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-neutral-500">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-100">{value ?? '—'}</p>
    </div>
  );
}
