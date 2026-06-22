import { toFile } from 'openai';
import { openai } from './client';
import { model } from './models';

/**
 * Transcribe one short audio chunk. MVP approach: chunked STT.
 * The renderer captures audio and sends ArrayBuffer chunks over IPC; main wraps
 * them as a file for the transcription endpoint.
 * Later: replace with the Realtime API for delta-level latency (realtime.ts).
 */
export async function transcribeChunk(
  audio: ArrayBuffer,
  mime = 'audio/webm',
): Promise<string> {
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'mp4' : 'webm';
  const file = await toFile(Buffer.from(audio), `chunk.${ext}`, { type: mime });
  const res = await openai().audio.transcriptions.create({
    model: model('transcription'),
    file,
  });
  return res.text;
}
