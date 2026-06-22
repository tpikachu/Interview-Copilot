# AI Interview Assistant

A desktop (Electron) interview assistant. **Local-first data, bring-your-own
OpenAI key.** It transcribes interviews, detects questions, and surfaces
grounded answer suggestions in a floating always-on-top overlay using your
resume / job description / notes (local RAG).

> Use this only where AI assistance is permitted. Your data stays on your
> machine; only the retrieved context + question is sent to OpenAI.

## Stack
Electron · React · TypeScript · Vite (electron-vite) · TailwindCSS · Zustand ·
SQLite (better-sqlite3) · Drizzle ORM · OpenAI Node SDK · Tesseract.js ·
electron-builder.

## Design docs
See [`docs/`](docs/):
1. [PRD](docs/01-PRD.md)
2. [Architecture](docs/02-ARCHITECTURE.md)
3. [Windows (main/renderer/overlay)](docs/03-WINDOWS.md)
4. [Database schema](docs/04-DATABASE.md)
5. [IPC map](docs/05-IPC-MAP.md)
6. [OpenAI service layer](docs/06-OPENAI-SERVICE.md)
7. [API key security](docs/07-API-KEY-SECURITY.md)
8. [Folder structure](docs/08-FOLDER-STRUCTURE.md)
9. [MVP plan](docs/09-MVP-PLAN.md)

## Getting started
```bash
npm install
cp .env.example .env      # optional: put OPENAI_API_KEY for dev
npm run db:generate       # generate the initial Drizzle migration
npm run dev               # launch the app with HMR
```
In production you set the key in **Settings** (encrypted via OS secure storage).

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | electron-vite dev (HMR) |
| `npm run typecheck` | type-check main + renderer |
| `npm run db:generate` | generate SQL migrations from the Drizzle schema |
| `npm run build` | typecheck + bundle |
| `npm run package` | build installer via electron-builder |

## Security invariants
- The OpenAI key lives **only** in the main process; the renderer learns a
  boolean `apiKeyPresent` and nothing more.
- All OpenAI/DB/secret access happens in main; the renderer talks via the typed
  `window.api` preload bridge.
- `.env` is gitignored; the key is never logged (logger redacts `sk-…`).

## Status
Skeleton implements M0 (plumbing) and most of the M1/M2 service layer. See
[docs/09-MVP-PLAN.md](docs/09-MVP-PLAN.md). Items marked in code as M1/M2/M4 are
where the remaining UI wiring lands.
