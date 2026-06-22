import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { floatTo16BitPCM, rms } from './pcm';

export type AudioSource = 'mic' | 'system';

/**
 * Live audio capture for Realtime transcription.
 * Streams PCM16 @ 24kHz mono to the main process, which forwards it to the
 * OpenAI Realtime API (server-side VAD + gpt-4o-transcribe).
 *
 * Source:
 *  - 'system' captures speaker/loopback audio = the INTERVIEWER's voice in an
 *    online call (the correct source for Zoom/Meet/Teams).
 *  - 'mic' captures the microphone (in-person interviews / room audio).
 * Both apply browser noise suppression where available.
 */
export function useMicCapture() {
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null); // exposed for the waveform

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef('');

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* labels need permission */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const getStream = async (source: AudioSource): Promise<MediaStream> => {
    if (source === 'system') {
      // Electron's display-media handler returns system audio (loopback).
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      display.getVideoTracks().forEach((t) => t.stop()); // keep audio only
      if (display.getAudioTracks().length === 0) {
        throw new Error('No system audio captured. Use Microphone, or check audio is playing.');
      }
      return display;
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  };

  const start = useCallback(
    async (sessionId: string, source: AudioSource) => {
      setError(null);
      try {
        const stream = await getStream(source);
        streamRef.current = stream;
        setStream(stream);
        sessionRef.current = sessionId;

        const ctx = new AudioContext({ sampleRate: 24000 });
        await ctx.resume();
        ctxRef.current = ctx;

        const src = ctx.createMediaStreamSource(stream);
        const node = ctx.createScriptProcessor(4096, 1, 1);
        nodeRef.current = node;

        node.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          setSpeaking(rms(input) > 0.012);
          api.session.sendRealtimeAudio(sessionId, floatTo16BitPCM(input).buffer as ArrayBuffer);
        };

        // Zero-gain sink keeps the processor running without audible playback.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        src.connect(node);
        node.connect(mute);
        mute.connect(ctx.destination);

        setRecording(true);
        await refreshDevices();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [deviceId, refreshDevices],
  );

  const stop = useCallback(() => {
    if (nodeRef.current) nodeRef.current.onaudioprocess = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setRecording(false);
    setSpeaking(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { recording, speaking, error, devices, deviceId, setDeviceId, stream, start, stop };
}
