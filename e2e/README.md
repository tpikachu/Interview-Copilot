# End-to-end tests (Playwright + Electron)

These drive the **built** Electron app — real main process, real SQLite, real IPC —
to cover what the vitest unit suite structurally can't (the DB layer is built for
Electron's ABI and won't load under node).

## Setup

```bash
npm install            # pulls @playwright/test + dotenv (added to devDependencies)
npx playwright install # one-time: Playwright's browser/driver deps
```

For the **live tier**, put your key in `.env` (already gitignored):

```
OPENAI_API_KEY=sk-...
```

## Run

```bash
npm run test:e2e        # builds first, then runs all specs
npm run test:e2e:only   # skip the build (use the existing out/ bundle)
npx playwright test e2e/data-integrity.spec.ts   # one file
```

Two tiers:
- **Default (no key):** UI smoke + data-integrity (FK cascade, settings round-trip) via
  the real DB. Runs in CI.
- **Live (`OPENAI_API_KEY` set):** `live-openai.spec.ts` hits real OpenAI (résumé parse
  + embeddings + RAG). It asserts on *structure*, not exact text. Skipped without a key.

## What's covered / not

- ✅ App launches; dashboard renders; navigation.
- ✅ Real main + SQLite via `window.api`: interview delete **FK cascade**, profile-delete
  cascade, model preset + per-task override round-trip.
- ✅ (live) résumé parse → embed → RAG retrieval.
- ❌ **Live transcription / mic / screen capture / global shortcuts** — need real
  hardware + a display; not automatable headlessly. Their pure logic is unit-tested;
  the answer pipeline is exercised here via the no-audio sample/RAG path.

## Notes / gotchas

- Tests launch `out/main/index.js`, so a **build must exist** (`test:e2e` builds for you).
- Each test runs against an **isolated data dir** (`E2E_USER_DATA`, honored by
  `src/main/index.ts`) so your real profiles/sessions are never touched.
- Data-integrity specs use `window.api` directly rather than clicking through forms —
  robust, and they target the exact main/DB paths. UI-selector specs (smoke) may need
  selector tweaks on first run; adjust to match the rendered DOM.
- Privacy Mode (content protection) excludes windows from *screen capture*, not from
  Playwright's CDP connection, so it doesn't interfere here.
