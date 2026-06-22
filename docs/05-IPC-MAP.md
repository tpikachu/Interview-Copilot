# IPC Event Map

Two directions:
- **invoke/handle** — renderer → main request/response (`ipcRenderer.invoke` ↔
  `ipcMain.handle`). Used for all CRUD and commands. Returns a `Result<T>`.
- **send/on** — main → renderer push events (`webContents.send` ↔
  `ipcRenderer.on`). Used for streaming deltas and state changes.

All channels are defined as constants in `src/shared/ipc.ts`. Every handler
validates input with zod. Errors are returned as `{ ok:false, error }`, never
thrown across the boundary.

## Channel naming
`<domain>:<action>` — domains: `app`, `settings`, `profiles`, `documents`,
`notes`, `rag`, `session`, `capture`, `overlay`, `privacy`.

## invoke / handle (request → response)

### app / settings
| Channel | Request | Response |
|---|---|---|
| `app:get-info` | — | `{ version, platform }` |
| `dialog:open-file` | — | `{ filePath: string \| null }` (native open dialog; renderer then calls `documents:import-file`) |
| `settings:get` | — | `AppSettings` (no raw key — only `apiKeyPresent`) |
| `settings:set` | `Partial<AppSettings>` | `AppSettings` |
| `settings:set-api-key` | `{ key: string }` | `{ apiKeyPresent: true }` |
| `settings:clear-api-key` | — | `{ apiKeyPresent: false }` |
| `settings:test-api-key` | — | `{ ok, model? , error? }` |

### profiles
| `profiles:list` | — | `Profile[]` |
| `profiles:get` | `{ id }` | `Profile` |
| `profiles:create` | `ProfileInput` | `Profile` |
| `profiles:update` | `{ id, patch }` | `Profile` |
| `profiles:delete` | `{ id }` | `{ deleted: true }` |
| `profiles:duplicate` | `{ id }` | `Profile` |

### documents
| `documents:import-file` | `{ profileId, kind, filePath }` | `Document` |
| `documents:import-text` | `{ profileId, kind, filename, text }` | `Document` |
| `documents:list` | `{ profileId }` | `Document[]` |
| `documents:delete` | `{ id }` | `{ deleted: true }` |
| `documents:parse` | `{ documentId }` | `{ parsed, chunks, embedded }` |
| `documents:reindex-profile` | `{ profileId }` | `{ chunks, embedded }` |

### notes
| `notes:list` | `{ profileId }` | `Note[]` |
| `notes:create` | `{ profileId, content }` | `Note` |
| `notes:delete` | `{ id }` | `{ deleted: true }` |

### rag (mostly internal; exposed for debugging)
| `rag:search` | `{ profileId, query, k }` | `RetrievedChunk[]` |

### session
| `session:start` | `{ profileId, interviewType }` | `Session` |
| `session:stop` | `{ sessionId }` | `Session` |
| `session:toggle-pause` | `{ sessionId }` | `{ paused }` |
| `session:audio-chunk` | `{ sessionId, audio:ArrayBuffer, mime }` | `{ accepted }` |
| `session:list` | — | `Session[]` |
| `session:get` | `{ id }` | `SessionDetail` (transcript+questions+answers) |
| `session:delete` | `{ id }` | `{ deleted: true }` |
| `session:generate-report` | `{ sessionId }` | `SessionReport` |
| `session:get-report` | `{ sessionId }` | `SessionReport` |
| `session:ask` | `{ sessionId, questionText }` | `{ questionId }` (manual ask; answer streams) |

### capture / coding
| `capture:region` | — | `{ image: dataURL }` (ad-hoc full-screen grab) |
| `capture:open-selector` | — | `{ opened }` (captures screen, opens full-screen region selector window) |
| `capture:get-frame` | — | `{ image }` (selection renderer fetches the frozen frame to crop) |
| `capture:close-selector` | — | `{ closed }` |
| `capture:ocr` | `{ image }` | `{ text }` (Tesseract.js, local) |
| `capture:solve` | `{ text }` | `{ questionId }` (announces a `coding` question, solution streams to overlay) |

### overlay / privacy
| `overlay:show` / `overlay:hide` / `overlay:toggle` | — | `{ visible }` |
| `overlay:set-mode` | `{ mode:'compact'|'expanded' }` | `{ mode }` |
| `overlay:set-opacity` | `{ opacity }` | `{ opacity }` |
| `overlay:set-clickthrough` | `{ enabled }` | `{ enabled }` |
| `privacy:toggle` | — | `{ enabled }` |
| `privacy:get` | — | `{ enabled }` |

## send / on (main → renderer events)

| Channel | Payload | Target |
|---|---|---|
| `session:state` | `{ status, paused }` | dashboard + overlay |
| `session:transcript-delta` | `{ text, isFinal, speaker }` | dashboard + overlay |
| `session:question-detected` | `DetectedQuestion` | dashboard + overlay |
| `session:answer-delta` | `{ questionId, token }` | overlay (+ dashboard) |
| `session:answer-meta` | `{ questionId, talkingPoints, resumeMatch, star, riskWarning, ... }` | overlay |
| `session:answer-done` | `{ questionId }` | overlay |
| `session:error` | `{ message }` | dashboard + overlay |
| `overlay:apply-settings` | `{ opacity, fontSize, mode }` | overlay |
| `shortcut:fired` | `{ action }` | dashboard |

## Result envelope
```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```
The preload wrapper unwraps `Result` and throws on `ok:false` so renderer code
can use normal try/catch / async-await.
