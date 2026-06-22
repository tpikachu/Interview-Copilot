import { useEffect, useRef } from 'react';

/** Live audio waveform for the captured stream (mic or system audio). Uses its
 *  own AnalyserNode so it doesn't interfere with the capture/transcription graph. */
export function Waveform({
  stream,
  className = '',
}: {
  stream: MediaStream | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.beginPath();
      const step = width / data.length;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 255) * height;
        const x = i * step;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void audio.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} width={600} height={48} className={className} />;
}
