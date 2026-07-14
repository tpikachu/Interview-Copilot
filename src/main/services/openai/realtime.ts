import WebSocket from 'ws';
import { apiKeyStore } from '../security/apiKey';
import { model } from './models';
import { parseRealtimeEvent } from './realtimeEvents';
import { log } from '../security/logger';

export interface RealtimeCallbacks {
  onDelta: (text: string) => void; // partial transcript for the current turn
  onFinal: (text: string) => void; // finalized transcript for a turn
  onSpeechStart?: () => void;
  onSpeechStop?: () => void;
  onError?: (message: string) => void;
  onOpen?: () => void;
  /** Connection lifecycle for the UI: 'reconnecting' while automatic recovery is
   *  in progress, 'connected' when a (re)connection is established. */
  onStatus?: (status: 'reconnecting' | 'connected') => void;
}

/** Bounded automatic recovery from an unexpected socket drop mid-interview —
 *  the worst possible moment to require a manual stop/resume. Exponential
 *  backoff; a connection that stays up ≥ STABLE_CONNECTION_MS refills the
 *  retry budget so one blip an hour never exhausts it. */
const MAX_RECONNECT_ATTEMPTS = 5;
const STABLE_CONNECTION_MS = 30_000;
const reconnectDelayMs = (attempt: number) => Math.min(8_000, 500 * 2 ** attempt);

/**
 * Streaming speech-to-text via the OpenAI Realtime API (transcription intent).
 * The WebSocket is opened from the MAIN process with the API key (never the
 * renderer). Server-side VAD segments turns; we emit partial deltas live and a
 * precise finalized transcript per turn — much better latency/accuracy than
 * uploading audio chunks.
 */
export class RealtimeTranscriber {
  private ws: WebSocket | null = null;
  private ready = false;
  private closing = false;
  private surfacedError = false; // a specific error was already surfaced this reconnect cycle
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectedAt = 0;

  constructor(
    private cb: RealtimeCallbacks,
    private language = 'en',
  ) {}

  start(): void {
    this.closing = false;
    this.surfacedError = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  private connect(): void {
    const key = apiKeyStore.getDecrypted();
    if (!key) {
      this.cb.onError?.('No OpenAI API key configured.');
      return;
    }
    // GA Realtime API: the beta shape was retired (the `OpenAI-Beta: realtime=v1`
    // header + `transcription_session.update` event), which is why the server now
    // rejects beta connections with `beta_api_shape_disabled`.
    this.ws = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    // Guard every handler against a STALE socket: after a reconnect replaces
    // this.ws, late events from the old connection must not touch shared state.
    const ws = this.ws;

    ws.on('open', () => {
      if (ws !== this.ws) return;
      // GA transcription-session config: nested under session.audio.input. The
      // server response event names (…input_audio_transcription.delta/.completed)
      // are unchanged, so the parser in realtimeEvents.ts still applies.
      this.send({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: {
                model: model('transcription'),
                language: this.language,
              },
              // Server VAD finds turn boundaries; tuned for conversational speech.
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 600,
              },
              noise_reduction: { type: 'near_field' },
            },
          },
        },
      });
      this.ready = true;
      this.connectedAt = Date.now();
      this.surfacedError = false; // a fresh connection starts a clean error cycle
      this.cb.onStatus?.('connected');
      this.cb.onOpen?.();
      log.info(
        this.reconnectAttempts > 0
          ? `realtime: transcription session reconnected (attempt ${this.reconnectAttempts})`
          : 'realtime: transcription session opened',
      );
    });

    ws.on('message', (data) => {
      if (ws !== this.ws) return;
      this.handle(data.toString());
    });
    ws.on('error', (err) => {
      if (ws !== this.ws) return;
      log.error('realtime: ws error', err.message);
      // Surface only the FIRST specific error per reconnect cycle (an expired key
      // fails every retry identically — one toast, not five).
      if (!this.closing && !this.surfacedError) {
        this.surfacedError = true;
        this.cb.onError?.(`Realtime transcription error: ${err.message}`);
      }
    });
    ws.on('close', (code, reason) => {
      if (ws !== this.ws) return;
      this.ready = false;
      if (this.closing) return;
      log.warn(`realtime: ws closed (${code}) ${reason.toString()}`);

      // A connection that stayed up long enough refills the retry budget — the
      // cap is for a hard outage, not for occasional blips over a long interview.
      if (this.connectedAt && Date.now() - this.connectedAt >= STABLE_CONNECTION_MS) {
        this.reconnectAttempts = 0;
      }
      this.connectedAt = 0;

      if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = reconnectDelayMs(this.reconnectAttempts);
        this.reconnectAttempts += 1;
        this.cb.onStatus?.('reconnecting');
        log.warn(
          `realtime: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
        );
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.closing) this.connect();
        }, delay);
        return;
      }

      // Out of retries: the interview would otherwise silently go deaf while the
      // mic keeps streaming into a dead socket. If a specific error was already
      // surfaced this cycle (e.g. expired key), don't clobber it with a generic one.
      if (!this.surfacedError) {
        this.cb.onError?.(
          'Transcription disconnected and could not reconnect — stop and resume the interview.',
        );
      }
    });
  }

  /** Append base64-encoded PCM16 (24kHz mono) audio. */
  appendAudio(base64Pcm: string): void {
    if (!this.ready) return;
    this.send({ type: 'input_audio_buffer.append', audio: base64Pcm });
  }

  stop(): void {
    this.closing = true;
    this.ready = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private handle(raw: string): void {
    const action = parseRealtimeEvent(raw);
    if (!action) return;
    switch (action.type) {
      case 'delta':
        this.cb.onDelta(action.text);
        break;
      case 'final':
        this.cb.onFinal(action.text);
        break;
      case 'speech-start':
        this.cb.onSpeechStart?.();
        break;
      case 'speech-stop':
        this.cb.onSpeechStop?.();
        break;
      case 'error':
        this.cb.onError?.(action.message);
        break;
    }
  }
}
