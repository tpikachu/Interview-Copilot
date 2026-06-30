import { useCallback, useRef, useState } from 'react';

/** Records a single answer (one continuous clip) and returns it as an ArrayBuffer
 *  when stopped. Used by the mock interview to capture a spoken answer. */
export function useAnswerRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // Set true when stop() is called while start() is still acquiring the mic, so the
  // in-flight start can release the just-granted stream instead of leaking a hot mic.
  const stopRequestedRef = useRef(false);

  const mime = () => {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return c.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';
  };

  const start = useCallback(async () => {
    setError(null);
    stopRequestedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      // A stop was requested while the permission/getUserMedia await was pending —
      // release the stream immediately rather than starting an orphaned recorder.
      if (stopRequestedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime() });
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const stop = useCallback(
    () =>
      new Promise<{ buffer: ArrayBuffer; mime: string } | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
          // No live recorder yet — if a start() is mid-flight, tell it to bail.
          stopRequestedRef.current = true;
          resolve(null);
          return;
        }
        recorder.onstop = async () => {
          const type = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setRecording(false);
          resolve({ buffer: await blob.arrayBuffer(), mime: type });
        };
        recorder.stop();
      }),
    [],
  );

  return { recording, error, start, stop };
}
