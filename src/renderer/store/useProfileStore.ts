import { create } from 'zustand';
import { api } from '../lib/api';
import type { Profile, ProfileInput } from '@shared/types';

interface ProfileState {
  profiles: Profile[];
  load: () => Promise<void>;
  create: (input: ProfileInput) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  load: async () => {
    const profiles = (await api.profiles.list()) as Profile[];
    set({ profiles });
  },
  create: async (input) => {
    const profile = (await api.profiles.create(input)) as Profile;
    await get().load();
    return profile;
  },
  remove: async (id) => {
    await api.profiles.delete(id);
    await get().load();
  },
}));
