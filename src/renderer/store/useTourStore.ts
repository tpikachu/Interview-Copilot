import { create } from 'zustand';

/** Controls the guided tour overlay. App renders the tour when `running`;
 *  the Settings page can replay it via `start()`. */
interface TourState {
  running: boolean;
  start: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  running: false,
  start: () => set({ running: true }),
  stop: () => set({ running: false }),
}));
