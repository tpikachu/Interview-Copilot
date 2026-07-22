import { test, expect } from './fixtures';

// Sanity: the app launches, the dashboard renders, and core navigation works.
// No OpenAI key required.
test.describe('smoke', () => {
  test('dashboard window opens and renders the shell', async ({ dashboard }) => {
    await expect(dashboard.locator('#root')).toBeVisible();
    // The brand wordmark is always present in the sidebar.
    await expect(dashboard.getByText(/BrainCue/i).first()).toBeVisible();
  });

  test('can navigate to Settings', async ({ dashboard }) => {
    await dashboard.getByRole('link', { name: /settings/i }).first().click();
    await expect(dashboard.getByRole('heading', { name: 'OpenAI API Key' })).toBeVisible();
    await expect(dashboard.getByRole('heading', { name: 'OpenAI Models' })).toBeVisible();
  });

  test('can navigate to Interview', async ({ dashboard }) => {
    await dashboard.getByRole('link', { name: /interview/i }).first().click();
    await expect(dashboard.getByText(/Pick a profile/i)).toBeVisible();
  });

  test('Home is the universal launcher', async ({ dashboard }) => {
    await dashboard.getByRole('link', { name: /home/i }).first().click();
    await expect(dashboard.getByText('How can BrainCue help right now?')).toBeVisible();
    // The shared start flow opens from the primary action and starts NOTHING
    // until the explicit button — the transparency summary is shown first.
    await dashboard.getByRole('button', { name: /start listening/i }).first().click();
    await expect(dashboard.getByText(/Sent to OpenAI/i)).toBeVisible();
    await expect(dashboard.getByText(/Never sent/i)).toBeVisible();
    await dashboard.keyboard.press('Escape');
  });

  test('Library has Profile / Spaces / Documents tabs', async ({ dashboard }) => {
    await dashboard.getByRole('link', { name: /library/i }).first().click();
    await expect(dashboard.getByRole('tab', { name: 'Profile' })).toBeVisible();
    await dashboard.getByRole('tab', { name: 'Spaces' }).click();
    await expect(dashboard.getByText(/A Space is everything BrainCue should know/i)).toBeVisible();
    await dashboard.getByRole('tab', { name: 'Documents' }).click();
    await expect(dashboard.getByText(/ingested for this profile/i)).toBeVisible();
  });

  test('old /profiles route redirects into the Library', async ({ dashboard }) => {
    await dashboard.evaluate(() => {
      window.location.hash = '#/profiles';
    });
    await expect(dashboard.getByRole('tab', { name: 'Profile' })).toBeVisible();
  });

  test('Sessions and Insights are separate sections', async ({ dashboard }) => {
    await dashboard.getByRole('link', { name: /sessions/i }).first().click();
    await expect(dashboard.getByText(/Every saved session/i)).toBeVisible();
    await dashboard.getByRole('link', { name: /insights/i }).first().click();
    await expect(dashboard.getByText(/practice progress and overall usage/i)).toBeVisible();
  });
});
