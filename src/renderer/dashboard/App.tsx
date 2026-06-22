import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from '../lib/api';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTourStore } from '../store/useTourStore';
import { Tour, TOUR_STEPS } from './Tour';
import ProfilesPage from './pages/ProfilesPage';
import ProfileEditorPage from './pages/ProfileEditorPage';
import SessionPage from './pages/SessionPage';
import MockPage from './pages/MockPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

const navItems = [
  { to: '/profiles', label: 'Profiles', icon: '👤', tour: 'nav-profiles' },
  { to: '/session', label: 'Live Session', icon: '🎙', tour: 'nav-session' },
  { to: '/mock', label: 'Mock Interview', icon: '🧑‍🏫', tour: 'nav-mock' },
  { to: '/reports', label: 'Reports', icon: '📄', tour: 'nav-reports' },
  { to: '/settings', label: 'Settings', icon: '⚙', tour: 'nav-settings' },
];

export default function App() {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const { settings, load: loadSettings } = useSettingsStore();
  const { running, start, stop } = useTourStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Auto-launch the tour once for a brand-new user (tourDone is persisted, so
  // finishing/skipping prevents it from showing again).
  useEffect(() => {
    if (settings && !settings.tourDone) start();
  }, [settings, start]);

  const finishTour = async () => {
    stop();
    await api.settings.set({ tourDone: true });
    await loadSettings();
  };

  const toggleOverlay = async () => {
    const { visible } = (await api.overlay.toggle()) as { visible: boolean };
    setOverlayVisible(visible);
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-neutral-950 to-neutral-900 text-neutral-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5 bg-neutral-950/60 p-4">
        <div className="mb-8 flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold shadow-lg shadow-indigo-900/40">
            AI
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Interview</h1>
            <p className="text-xs text-neutral-500">Assistant</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-tour={n.tour}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-500/10 text-white'
                    : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-indigo-400" />
                  )}
                  <span className="text-base">{n.icon}</span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={toggleOverlay}
          data-tour="overlay-toggle"
          title="Show/hide the floating answer overlay (Ctrl+Shift+Space)"
          className={`mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            overlayVisible
              ? 'bg-indigo-500/10 text-white'
              : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
          }`}
        >
          <span className="text-base">🪟</span>
          {overlayVisible ? 'Hide overlay' : 'Show overlay'}
        </button>

        <p className="mt-auto px-2 text-xs leading-relaxed text-neutral-600">
          Use only where AI assistance is allowed. Data stays local; only retrieved
          context is sent to OpenAI.
        </p>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/profiles" replace />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileEditorPage />} />
          <Route path="/session" element={<SessionPage />} />
          <Route path="/mock" element={<MockPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {running && <Tour steps={TOUR_STEPS} onClose={finishTour} />}
    </div>
  );
}
