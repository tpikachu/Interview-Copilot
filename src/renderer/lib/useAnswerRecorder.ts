import { useCallback, useRef, useState } from 'react';

/** Records a single answer (one continuous clip) and returns it as an ArrayBuffer
 *  when stopped. Used by the mock interview to capture a spoken answer. */
export function useAnswerRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const mime = () => {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return c.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';
  };

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
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
