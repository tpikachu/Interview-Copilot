import { describe, expect, it } from 'vitest';
import { parseRealtimeEvent } from './realtimeEvents';

describe('parseRealtimeEvent (live transcription)', () => {
  it('parses a partial transcript delta', () => {
    const ev = parseRealtimeEvent(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Tell ' }),
    );
    expect(ev).toEqual({ type: 'delta', text: 'Tell ' });
  });

  it('parses a finalized transcript and trims it', () => {
    const ev = parseRealtimeEvent(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: '  Tell me about yourself.  ',
      }),
    );
    expect(ev).toEqual({ type: 'final', text: 'Tell me about yourself.' });
  });

  it('parses speech start/stop', () => {
    expect(parseRealtimeEvent(JSON.stringify({ type: 'input_audio_buffer.speech_started' }))).toEqual({
      type: 'speech-start',
    });
    expect(parseRealtimeEvent(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }))).toEqual({
      type: 'speech-stop',
    });
  });

  it('parses errors with a fallback message', () => {
    expect(parseRealtimeEvent(JSON.stringify({ type: 'error', error: { message: 'bad key' } }))).toEqual(
      { type: 'error', message: 'bad key' },
    );
    expect(parseRealtimeEvent(JSON.stringify({ type: 'error' }))).toEqual({
      type: 'error',
      message: 'Realtime error',
    });
  });

  it('ignores unknown events, empty deltas, and invalid JSON', () => {
    expect(parseRealtimeEvent(JSON.stringify({ type: 'session.updated' }))).toBeNull();
    expect(
      parseRealtimeEvent(
        JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: '' }),
      ),
    ).toBeNull();
    expect(parseRealtimeEvent('not json {')).toBeNull();
  });
});
