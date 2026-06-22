// Pure parser for OpenAI Realtime (transcription) server events. Kept separate
// from the WebSocket plumbing so the live-session transcription logic is
// unit-testable without a network/key.

export type RealtimeAction =
  | { type: 'delta'; text: string }
  | { type: 'final'; text: string }
  | { type: 'speech-start' }
  | { type: 'speech-stop' }
  | { type: 'error'; message: string }
  | null;

/** Parse a raw server message into a normalized action (or null to ignore). */
export function parseRealtimeEvent(raw: string): RealtimeAction {
  let msg: {
    type?: string;
    delta?: string;
    transcript?: string;
    error?: { message?: string };
  };
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }

  switch (msg.type) {
    case 'conversation.item.input_audio_transcription.delta':
      return msg.delta ? { type: 'delta', text: msg.delta } : null;
    case 'conversation.item.input_audio_transcription.completed':
      return msg.transcript ? { type: 'final', text: msg.transcript.trim() } : null;
    case 'input_audio_buffer.speech_started':
      return { type: 'speech-start' };
    case 'input_audio_buffer.speech_stopped':
      return { type: 'speech-stop' };
    case 'error':
      return { type: 'error', message: msg.error?.message ?? 'Realtime error' };
    default:
      return null;
  }
}
