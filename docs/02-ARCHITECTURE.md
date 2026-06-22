# Technical Architecture

## 1. High-level

```
┌──────────────────────────────────────────────────────────────────┐
│                          Electron App                              │
│                                                                    │
│  ┌────────────────────┐         ┌──────────────────────────────┐  │
│  │   MAIN PROCESS     │  IPC     │        RENDERER(S)           │  │
│  │  (Node.js, trusted)│◀────────▶│  (Chromium, sandboxed)       │  │
│  │                    │ preload  │                              │  │
│  │ • app lifecycle    │ bridge   │  ┌────────────────────────┐  │  │
│  │ • window mgmt      │          │  │ Dashboard window (React)│  │  │
│  │ • global shortcuts │          │  └────────────────────────┘  │  │
│  │ • screenshot       │          │  ┌────────────────────────┐  │  │
│  │ • OpenAI calls ◀───┼── only   │  │ Overlay window (React)  │  │  │
│  │ • SQLite/Drizzle   │   here   │  └────────────────────────┘  │  │
│  │ • API key (safeStorage)       │                              │  │
│  │ • RAG retrieval    │          │  Zustand stores, Tailwind UI │  │
│  └────────────────────┘         └──────────────────────────────┘  │
│            │                                                       │
│            ▼                                                       │
│   userData/  ├─ app.db (SQLite)                                    │
│              ├─ documents/ (original uploads)                      │
│              └─ vectors/   (LanceDB or in-db vectors)             │
└──────────────────────────────────────────────────────────────────┘
                         │  HTTPS (only from main)
                         ▼
                    OpenAI API
```

**Golden rule:** all network/AI/database/secret access lives in the **main
process**. The renderer is treated as untrusted and reaches the main process
only through a typed, allow-listed preload bridge.

## 2. Core stack

| Concern | Choice |
|---|---|
| Shell | Electron |
| UI | React + TypeScript |
| Bundler/dev | Vite (via `electron-vite`) |
| Styling | TailwindCSS |
| Renderer state | Zustand |
| DB | SQLite via `better-sqlite3` |
| ORM/migrations | Drizzle ORM + drizzle-kit |
| Vectors | MVP: vectors stored in SQLite (JSON/BLOB) + in-process cosine search. Scale path: LanceDB or `sqlite-vec` extension. |
| AI | OpenAI Node SDK — Responses API, embeddings, STT/transcription |
| OCR | Tesseract.js (local); OpenAI Vision later |
| Packaging | electron-builder |

> **Vector decision for MVP:** brute-force cosine over stored embeddings in
> SQLite. Resume+JD+notes per profile = a few hundred chunks max, so in-memory
> cosine is sub-millisecond and avoids native-extension/packaging friction.
> The retriever is an interface (`VectorStore`) so we can swap in LanceDB or
> `sqlite-vec` without touching callers.

## 3. Process responsibilities

### Main process
App lifecycle; create/destroy windows; always-on-top & content protection;
register/unregister global shortcuts; `desktopCapturer` + region crop; coordinate
audio capture (renderer captures raw audio, main makes the STT call); store &
read API key via `safeStorage`; own the OpenAI client; own the DB; perform RAG;
register all IPC handlers.

### Renderer — Dashboard
All management UI: profiles, document upload, notes, session setup, live
transcript mirror, settings, reports. Talks only via `window.api.*`.

### Renderer — Overlay
Frameless transparent React app. Subscribes to streamed answer/transcript events
pushed from main. Controls: opacity, font size, compact/expanded, pause/resume.

### Preload
`contextBridge` exposes a single typed `window.api` object that forwards to
`ipcRenderer.invoke` (request/response) and `ipcRenderer.on` (events). No Node
APIs or the OpenAI key are ever exposed.

## 4. Data flow — live answer (happy path)

1. Renderer (session) captures mic audio → emits ~3–5s PCM/webm chunks via IPC.
2. Main streams chunk → OpenAI STT → transcript delta.
3. Main appends delta to transcript; runs lightweight question detector.
4. On a finalized question: main embeds it → `VectorStore.search()` top-k.
5. Main builds a grounded prompt (question + context + profile + style).
6. Main calls Responses API **streaming**; forwards tokens to overlay via IPC.
7. Main persists question, answer, and transcript chunks to SQLite.

## 5. OpenAI service layer

A thin internal service module (main only) wraps the SDK:

```
services/openai/
  client.ts        // lazily-built OpenAI client from decrypted key
  models.ts        // central model id config (Responses, embeddings, STT)
  parsing.ts       // resume/JD → structured JSON (json schema / structured output)
  embeddings.ts    // embed(texts[]) -> number[][]
  answer.ts        // streamAnswer(question, context, profile) -> async iterator
  questions.ts     // classifyQuestion(text) -> {type, confidence, strategy}
  transcription.ts // transcribeChunk(audio) -> text
  coding.ts        // solveFromOcr(text) -> approach/edge/complexity/outline
```

Cross-cutting: central model config, retry/backoff, error normalization,
token/cost estimation, and a single place that reads the decrypted key.

## 6. API key security (summary; full plan in 07)

- Dev: read `OPENAI_API_KEY` from env.
- Prod: user pastes key → encrypted with Electron `safeStorage` → stored in DB
  (`settings`) as ciphertext. Decrypted only in main, only in memory, at call
  time. Never sent over IPC, never logged, never committed. `keytar` is an
  optional alternative backend behind the same interface.

## 7. Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Strict CSP in renderer HTML; no remote code.
- IPC handlers validate every payload (zod) and are explicitly allow-listed.
- Overlay uses `setContentProtection(true)` in Privacy Mode.
