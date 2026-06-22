# Folder Structure

```
AI_Inter/
├─ docs/                        # this design set
├─ electron.vite.config.ts      # main + preload + renderer build config
├─ electron-builder.yml         # packaging
├─ drizzle.config.ts            # drizzle-kit (schema -> migrations)
├─ package.json
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json
├─ tailwind.config.js / postcss.config.js
├─ .env.example                 # OPENAI_API_KEY=  (real .env gitignored)
├─ .gitignore
├─ index.html                   # dashboard renderer entry
├─ overlay.html                 # overlay renderer entry
│
├─ src/
│  ├─ shared/                   # imported by BOTH main and renderer (types only)
│  │  ├─ ipc.ts                 # channel name constants
│  │  ├─ types.ts               # domain types (Profile, Session, ...)
│  │  └─ result.ts              # Result<T> envelope
│  │
│  ├─ main/                     # MAIN PROCESS (Node, trusted)
│  │  ├─ index.ts               # entry: lifecycle, init order
│  │  ├─ windows/
│  │  │  ├─ mainWindow.ts
│  │  │  └─ overlayWindow.ts
│  │  ├─ shortcuts.ts           # global shortcut registration
│  │  ├─ ipc/
│  │  │  ├─ index.ts            # registerIpc(): wires all handlers
│  │  │  ├─ helpers.ts          # handle() wrapper + zod validation
│  │  │  ├─ settings.ipc.ts
│  │  │  ├─ profiles.ipc.ts
│  │  │  ├─ documents.ipc.ts
│  │  │  ├─ notes.ipc.ts
│  │  │  ├─ session.ipc.ts
│  │  │  ├─ capture.ipc.ts
│  │  │  └─ overlay.ipc.ts
│  │  ├─ db/
│  │  │  ├─ index.ts            # better-sqlite3 + drizzle init + migrate
│  │  │  ├─ schema.ts           # drizzle table definitions
│  │  │  └─ repositories/       # typed data access per entity
│  │  │     ├─ profiles.repo.ts
│  │  │     ├─ documents.repo.ts
│  │  │     ├─ chunks.repo.ts
│  │  │     ├─ sessions.repo.ts
│  │  │     └─ settings.repo.ts
│  │  ├─ services/
│  │  │  ├─ openai/             # see 06-OPENAI-SERVICE.md
│  │  │  │  ├─ client.ts  models.ts  parsing.ts  embeddings.ts
│  │  │  │  ├─ questions.ts  answer.ts  transcription.ts  coding.ts
│  │  │  ├─ rag/
│  │  │  │  ├─ vectorStore.ts   # interface + SQLite cosine impl
│  │  │  │  ├─ chunker.ts       # text -> chunks
│  │  │  │  └─ retriever.ts     # embed query -> top-k
│  │  │  ├─ documents/
│  │  │  │  └─ extract.ts       # pdf/docx/txt/md -> text
│  │  │  ├─ capture/
│  │  │  │  ├─ screenshot.ts    # desktopCapturer + region crop
│  │  │  │  └─ ocr.ts           # Tesseract.js wrapper
│  │  │  ├─ session/
│  │  │  │  └─ sessionManager.ts# live session orchestration
│  │  │  └─ security/
│  │  │     ├─ apiKey.ts        # safeStorage-backed ApiKeyStore
│  │  │     └─ logger.ts        # redacting logger
│  │  └─ env.ts                 # isDev, paths, env var access
│  │
│  ├─ preload/
│  │  ├─ index.ts               # contextBridge -> window.api
│  │  └─ index.d.ts             # ambient types for window.api
│  │
│  └─ renderer/                 # RENDERER(S) (React)
│     ├─ main.tsx               # dashboard root
│     ├─ overlay.tsx            # overlay root
│     ├─ index.css              # tailwind entry
│     ├─ lib/
│     │  ├─ api.ts              # thin wrapper over window.api
│     │  └─ events.ts           # subscribe helpers for push events
│     ├─ store/                 # zustand
│     │  ├─ useSettingsStore.ts
│     │  ├─ useProfileStore.ts
│     │  └─ useSessionStore.ts
│     ├─ dashboard/
│     │  ├─ App.tsx  router.tsx
│     │  ├─ pages/  (Profiles, ProfileEditor, Session, Reports, Settings)
│     │  └─ components/
│     └─ overlay/
│        ├─ Overlay.tsx
│        └─ components/ (AnswerPanel, TranscriptStrip, OverlayControls)
│
└─ resources/                   # app icons etc.
```

## Module boundaries
- `src/shared` must contain **types and constants only** (no Node, no DOM) so it
  is safe to import from both sides.
- `src/main` may use Node + Electron main APIs. Never imported by renderer.
- `src/renderer` may use DOM/React. Reaches main only via `window.api`.
- `src/preload` is the only place using `contextBridge`/`ipcRenderer`.
