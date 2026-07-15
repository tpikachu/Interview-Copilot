import { describe, it, expect, beforeEach, vi } from 'vitest';

// Drive getPrivacy() via a stubbed settings repo (avoids better-sqlite3), and
// capture broadcasts/app-events so the module loads without electron windows.
const state = vi.hoisted(() => ({ privacy: '1' as string | null }));
vi.mock('../../db/repositories/settings.repo', () => ({
  SETTINGS_KEYS: { privacyMode: 'privacy_mode' },
  settingsRepo: {
    get: (k: string) => (k === 'privacy_mode' ? state.privacy : null),
    set: (_k: string, v: string) => {
      state.privacy = v;
    },
  },
}));
vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {} }));
vi.mock('../../ipc/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('@shared/ipc', () => ({ EVENTS: { privacyChanged: 'privacy:changed' } }));
vi.mock('../../appEvents', () => ({ appEvents: { emit: vi.fn() }, APP_EVENT: { privacyChanged: 'x' } }));

import { keepContentProtected, applyPrivacyToWindow } from './privacy';

/** A fake BrowserWindow that records setContentProtection calls and lets tests
 *  fire lifecycle events. */
function fakeWindow() {
  const handlers = new Map<string, (() => void)[]>();
  const msgHooks = new Map<number, (() => void)[]>();
  const calls: boolean[] = [];
  return {
    isDestroyed: () => false,
    setContentProtection: (v: boolean) => calls.push(v),
    on(ev: string, fn: () => void) {
      const l = handlers.get(ev) ?? [];
      l.push(fn);
      handlers.set(ev, l);
      return this;
    },
    hookWindowMessage(msg: number, fn: () => void) {
      const l = msgHooks.get(msg) ?? [];
      l.push(fn);
      msgHooks.set(msg, l);
    },
    fire(ev: string) {
      for (const fn of handlers.get(ev) ?? []) fn();
    },
    fireMsg(msg: number) {
      for (const fn of msgHooks.get(msg) ?? []) fn();
    },
    calls,
    handlers,
    msgHooks,
  };
}

beforeEach(() => {
  state.privacy = '1';
});

describe('keepContentProtected', () => {
  it('applies protection immediately and re-asserts on every drag-relevant event', () => {
    const w = fakeWindow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keepContentProtected(w as any);
    expect(w.calls).toEqual([true]); // applied up front

    // A drag fires many 'move' events; each must re-assert exclusion.
    w.fire('move');
    w.fire('move');
    w.fire('resize');
    w.fire('restore');
    w.fire('focus');
    w.fire('show');
    expect(w.calls.filter((c) => c === true).length).toBe(7); // 1 initial + 6 events
  });

  it('re-asserts the CURRENT state — clears protection when Privacy Mode is off', () => {
    const w = fakeWindow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keepContentProtected(w as any);
    expect(w.calls).toEqual([true]);
    state.privacy = '0'; // user turned Privacy Mode off
    w.fire('move'); // a later move must not re-hide against the user's choice
    expect(w.calls[w.calls.length - 1]).toBe(false);
  });

  it('subscribes to move + resize (the Windows drag/resize drop points)', () => {
    const w = fakeWindow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keepContentProtected(w as any);
    expect(w.handlers.has('move')).toBe(true);
    expect(w.handlers.has('resize')).toBe(true);
  });

  it.runIf(process.platform === 'win32')(
    're-asserts inside the native activation messages (earliest click signal), before the JS focus event',
    () => {
      const w = fakeWindow();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keepContentProtected(w as any);
      // WM_MOUSEACTIVATE (0x0021) is hooked — a click on the inactive window.
      expect(w.msgHooks.has(0x0021)).toBe(true);
      const before = w.calls.length;
      w.fireMsg(0x0021); // simulate the native click-activation message
      expect(w.calls.length).toBe(before + 1);
      expect(w.calls[w.calls.length - 1]).toBe(true);
    },
  );

  it('applyPrivacyToWindow reflects the stored setting', () => {
    const w = fakeWindow();
    state.privacy = '0';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    applyPrivacyToWindow(w as any);
    expect(w.calls).toEqual([false]);
  });
});
