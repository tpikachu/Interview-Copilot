import { create } from 'zustand';
import { api } from '../lib/api';
import type { AppSettings } from '@shared/types';

interface SettingsState {
  settings: AppSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  testApiKey: () => Promise<{ ok: boolean; model?: string; error?: string }>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true });
    const settings = (await api.settings.get()) as AppSettings;
    set({ settings, loading: false });
  },
  saveApiKey: async (key) => {
    await api.settings.setApiKey(key);
    const settings = (await api.settings.get()) as AppSettings;
    set({ settings });
  },
  clearApiKey: async () => {
    await api.settings.clearApiKey();
    const settings = (await api.settings.get()) as AppSettings;
    set({ settings });
  },
  testApiKey: () =>
    api.settings.testApiKey() as Promise<{ ok: boolean; model?: string; error?: string }>,
}));
