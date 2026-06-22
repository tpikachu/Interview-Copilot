import { openai } from './client';
import { model } from './models';

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** Synthesize speech for the mock interviewer's question. Returns MP3 bytes. */
export async function speak(text: string, voice: TtsVoice = 'alloy'): Promise<Buffer> {
  const res = await openai().audio.speech.create({
    model: model('tts'),
    voice,
    input: text,
    response_format: 'mp3',
  });
  return Buffer.from(await res.arrayBuffer());
}
