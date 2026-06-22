# Product Requirements Document — AI Interview Assistant

> Status: MVP scope. Last updated 2026-06-22.

## 1. Summary

A cross-platform **desktop** application that helps a candidate prepare for and
perform during interviews. It listens to the interview (microphone / audio
source), transcribes it, detects questions, and surfaces **grounded** answer
suggestions in a floating always-on-top overlay. Answers are grounded in the
user's own resume, job description, and notes via local RAG.

**This is not an offline app.** User data is stored **locally**, but AI features
call the **OpenAI API** using a key the user provides in Settings.

## 2. Goals

- Help users give better, truthful, profile-grounded interview answers.
- Keep all user data (resume, JD, transcripts, reports) on the local machine.
- Make AI assistance fast and unobtrusive via a floating overlay.
- Ship an MVP quickly using web tech on the desktop (Electron).

## 3. Non-Goals (explicitly out of scope)

- ❌ Authentication, user accounts, login
- ❌ Subscriptions / Stripe / billing
- ❌ Cloud backend, sync, or remote storage
- ❌ Admin dashboard, team dashboard
- ❌ Process hiding, task-manager spoofing, anti-proctoring / "undetectable" evasion

## 4. Target user

A single individual using their own machine, their own OpenAI API key, in a
context where AI assistance is **permitted** (practice, allowed take-homes,
sales-call coaching, accessibility support, etc.).

## 5. Key features

| # | Feature | MVP |
|---|---------|-----|
| 1 | Profile management (role, company, resume, JD, notes, interview type, style) | ✅ |
| 2 | Document ingestion (PDF/DOCX/TXT/MD/paste) + local text extraction | ✅ |
| 3 | OpenAI structured parsing of resume & JD into JSON | ✅ |
| 4 | Local embeddings + vector retrieval (RAG) | ✅ |
| 5 | Live session: mic capture → STT → transcript | ✅ |
| 6 | Question detection + classification | ✅ |
| 7 | Streaming grounded answer generation in overlay | ✅ |
| 8 | Floating overlay: always-on-top, compact/expanded, opacity, font size | ✅ |
| 9 | Global hotkeys (show/hide, pause AI, screenshot) | ✅ |
| 10 | Screenshot region capture + local OCR (Tesseract.js) → coding help | ✅ |
| 11 | Session report generation | ✅ |
| 12 | Secure API key storage (safeStorage / OS keychain) | ✅ |
| 13 | Privacy Mode (reduce accidental screen-share exposure) | ✅ |
| 14 | Local data deletion (profiles, docs, sessions, reports) | ✅ |
| 15 | OpenAI Realtime transcription (low latency) | Later |
| 16 | OpenAI Vision OCR fallback | Later |

## 6. User stories

- *As a user*, I paste my OpenAI key in Settings and it's stored securely so I
  never have to re-enter it and it never appears in the renderer.
- *As a user*, I create a profile with my resume + a job description so answers
  are tailored to that role.
- *As a user*, I start a live session and see the interviewer's questions
  transcribed and a suggested answer appear in a small overlay within ~2s.
- *As a user*, when asked something I have no experience with, the assistant
  warns me and offers a safe transferable-skills framing instead of inventing.
- *As a user*, I press a hotkey, select a screen region with a coding problem,
  and get an approach + complexity + solution outline.
- *As a user*, I turn on Privacy Mode before sharing my screen so the overlay
  won't be captured / is hidden.
- *As a user*, I review a session report afterward and can delete any data.

## 7. Functional requirements

### 7.1 Profiles
Fields: name, target role, target company, resume (file/text), JD (file/text),
additional notes, interview type {behavioral, technical, coding, system_design,
product, sales, general}, answer style {concise, detailed, STAR, technical,
conversational}, language preference. CRUD + duplicate + delete.

### 7.2 Documents
Accept PDF, DOCX, TXT, MD, pasted text. Extract raw text **locally**. Send text
to OpenAI for structured parsing. Persist parsed JSON + chunks + embeddings.

### 7.3 RAG
On detected question: embed query → vector search local store → take top-k
resume/JD/notes chunks → send only those + question to OpenAI → grounded answer.
Never invent experience; if no match, produce a transferable-skills answer and a
risk warning.

### 7.4 Live session
Select profile → select interview type → verify API key → choose audio source →
start. Show transcript, detected questions, streamed answers. Persist everything.
On stop, generate a report.

### 7.5 Overlay
Frameless, transparent, always-on-top, movable. Compact & expanded modes,
opacity slider, font-size control, pause/resume AI, show/hide via hotkey. Shows
live transcript, suggested answer (streaming), relevant resume/project points.

### 7.6 Screenshot / coding mode
Hotkey → region select → capture → Tesseract.js OCR → extract problem/code →
OpenAI returns approach, edge cases, complexity, solution outline. (Vision later.)

### 7.7 Privacy & compliance
Privacy Mode hides/excludes overlay from capture. Persistent reminder banner:
"Use only where AI assistance is allowed." Show exactly what is sent to OpenAI.
Full local deletion of any entity.

## 8. Non-functional requirements

- **Latency**: first answer token in overlay < 2.5s after question finalized.
- **Privacy**: API key never crosses IPC to renderer; never logged; never committed.
- **Storage**: all persistent data in app userData dir (SQLite + files).
- **Portability**: Windows + macOS (Linux best-effort) via electron-builder.
- **Resilience**: graceful handling of missing/invalid API key and offline state.

## 9. Success metrics (qualitative for MVP)

- Time-to-first-answer, transcription accuracy (subjective), groundedness (no
  fabricated experience), and overlay usability during a real call.

## 10. Risks

- STT latency/cost with chunked Whisper → mitigate with Realtime later.
- Hallucinated experience → strict grounding prompt + risk warnings.
- Overlay capture during screen share → Privacy Mode + content protection.
- API cost surprises → show token/cost estimates; user-owned key.
