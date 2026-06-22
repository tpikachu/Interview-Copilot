# OpenAI Service Layer Design

Lives entirely in the **main process** under `src/main/services/openai/`.
The renderer never imports the SDK and never sees the key.

## Model configuration (`models.ts`)

Central, overridable via `settings.models`:

```ts
export const defaultModels = {
  answer:       'gpt-4.1',                // Responses API, streaming
  parsing:      'gpt-4.1-mini',           // structured extraction
  classify:     'gpt-4.1-mini',           // question classification
  embedding:    'text-embedding-3-small', // 1536 dim
  transcription:'gpt-4o-transcribe',      // STT for audio chunks / Realtime
  tts:          'gpt-4o-mini-tts',         // mock-interviewer voice
  mock:         'gpt-4.1',                 // mock-interview question + feedback gen
  vision:       'gpt-4.1',                 // solve coding problems from an image
};
```
> Model ids are configuration, not contracts — keep them in one file so they can
> be tuned without code changes. Validate availability via `settings:test-api-key`.

## Client (`client.ts`)
- Lazily constructs `new OpenAI({ apiKey })` using the decrypted key from
  `services/security/apiKey.ts`.
- Rebuilds the client when the key changes; caches otherwise.
- Centralizes timeout, `maxRetries`, and error normalization
  (`normalizeOpenAIError` → user-safe string; full error only to local log).

## Functions

### parsing.ts — `parseResume(text)`, `parseJobDescription(text)`, `parseCompany(text)`
Uses Responses API with a JSON instruction to return typed JSON (defensively defaulted):
- Resume → `{ skills[], projects[], workHistory[], metrics[], education[], certifications[], techStack[], leadership[] }`
- JD → `{ requirements[], responsibilities[], keywords[], focusAreas[] }`
- Company → `{ overview, products[], techStack[], values[], culture[], recentNews[], interviewAngles[] }`
  from text scraped off the company website (see `services/documents/companyResearch.ts`),
  used to tailor answers to the company.

### embeddings.ts — `embed(texts: string[]) => Float32Array[]`
Batches inputs, returns vectors; caller stores BLOBs. Records model + dim.

### questions.ts — `classifyQuestion(text) => DetectedQuestion`
Small/fast model. Returns `{ text, type, confidence, strategy }`. Also used as a
cheap "is this actually a question?" gate before answer generation.

### answer.ts — `streamAnswer(input) => AsyncIterable<AnswerEvent>`
Input: `{ question, contextChunks, profile, style, interviewType }`.
Builds a **grounding** prompt:
- System: persona + rules ("ground answers in provided context; never invent
  experience; if no relevant experience, give a transferable-skills answer and
  set a risk warning").
- User: question + retrieved context + profile summary + desired style.
Streams tokens (`{type:'delta', token}`) plus a final structured meta object:
`{ talkingPoints[3..5], resumeMatch, star?, clarifyingQuestion?, riskWarning?, followupQuestion }`.
The handler relays deltas to overlay and persists the final answer.

### transcription.ts — `transcribeChunk(audio, mime) => string`
Sends an audio chunk to the transcription model; returns text (used for the
chunked path and mock-answer audio).

### realtime.ts — `RealtimeTranscriber`
Realtime API session for delta-level STT latency; PCM is streamed one-way via
`session:realtime-audio`. Event parsing lives in `realtimeEvents.ts`.

### coding.ts — `solveFromOcr(text)`, vision.ts — `solveFromImage(image)`
Given a coding problem as text (clipboard/selection) or an image, streams:
approach, edge cases, time/space complexity, solution outline (and code).

### interviewer.ts — `generateQuestion(...)` & tts.ts — `speak(text, voice)`
Power the mock-interview mode: `generateQuestion` produces the next question and
per-answer feedback; `speak` renders the interviewer's voice (returns audio Buffer).

## Cross-cutting
- **Cost/usage**: each call returns token usage; persisted on `ai_answers.tokens`
  and surfaced in the UI ("what was sent to OpenAI").
- **Grounding guard**: a post-check can flag answers that reference entities not
  present in the context (best-effort).
- **Abort**: every streaming call accepts an `AbortSignal` so pause/stop cancels
  in-flight generation.
- **Privacy**: context sent to OpenAI is exactly the retrieved chunks + question
  + profile summary — shown verbatim in the "Data sent" panel.
