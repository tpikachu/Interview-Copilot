import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/** True when a real OpenAI key is available (live tier). Tests needing OpenAI
 *  `test.skip(!hasKey, …)` so the suite still passes in CI without a key. */
export const hasKey = !!process.env.OPENAI_API_KEY;

interface Fixtures {
  app: ElectronApplication;
  /** The dashboard BrowserWindow (the one loaded WITHOUT a ?view= param). */
  dashboard: Page;
}

export const test = base.extend<Fixtures>({
  app: async ({}, use, testInfo) => {
    const app = await electron.launch({
      args: [resolve(process.cwd(), 'out/main/index.js')],
      env: {
        ...process.env,
        // Isolate each run's data dir so tests don't touch the real user DB.
        BRAINCUE_E2E: '1',
        // Electron reads userData from here when set (see note in e2e/README.md if
        // the app doesn't yet honor it — that's the one app hook Phase 2 may need).
        E2E_USER_DATA: resolve(testInfo.outputDir, 'userData'),
      },
    });
    await use(app);
    await app.close();
  },

  dashboard: async ({ app }, use) => {
    // The overlay/selection windows load with ?view=…; the dashboard has none.
    const isDashboard = async (p: Page) => !(await p.url()).includes('view=');
    let win = await app.firstWindow();
    if (!(await isDashboard(win))) {
      for (const w of app.windows()) if (await isDashboard(w)) win = w;
    }
    await win.waitForLoadState('domcontentloaded');
    // Skip the first-run guided tour so it doesn't overlay the UI under test.
    await win.evaluate(async () => {
      await (window as unknown as { api: { settings: { set: (p: unknown) => Promise<unknown> } } }).api.settings.set({
        tourDone: true,
      });
    });
    await use(win);
  },
});

/** Inject the real API key (live tier) via the typed preload facade. No-op without a key. */
export async function setApiKey(dashboard: Page): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;
  await dashboard.evaluate(async (k) => {
    await (window as unknown as { api: { settings: { setApiKey: (k: string) => Promise<unknown> } } }).api.settings.setApiKey(k);
  }, key);
}

export { expect };
