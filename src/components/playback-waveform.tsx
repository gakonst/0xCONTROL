import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { useTrackWaveform } from "@/hooks/use-track-waveform";
import type { WaveformBucket } from "@/data/tracks";

const PIXELS_PER_BUCKET = 2.2;
const CANVAS_HEIGHT = 180;

type PlaybackWaveformProps = {
  trackId: string;
  elapsedSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
};

export function PlaybackWaveform({
  trackId,
  elapsedSeconds,
  durationSeconds,
  isPlaying,
  onSeek,
}: PlaybackWaveformProps) {
  const { data, isLoading } = useTrackWaveform(trackId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canvasWidth = useMemo(() => {
    if (!data?.detail?.buckets?.length) return 0;
    return Math.max(600, Math.floor(data.detail.buckets.length * PIXELS_PER_BUCKET));
  }, [data]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = canvasWidth || 600;
    canvas.width = width;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const buckets = data?.detail?.buckets ?? [];
    if (!buckets.length) {
      drawEmpty(ctx, width, CANVAS_HEIGHT);
      return;
    }
    drawBuckets(ctx, buckets, canvas.width, canvas.height);
  }, [data, canvasWidth]);

  useEffect(() => {
    if (
      !data?.detail?.buckets?.length ||
      !scrollRef.current ||
      !canvasRef.current ||
      durationSeconds <= 0
    ) {
      return;
    }
    const ratio = Math.min(Math.max(elapsedSeconds / durationSeconds, 0), 1);
    const maxScroll = canvasRef.current.width - scrollRef.current.clientWidth;
    const target = ratio * canvasRef.current.width - scrollRef.current.clientWidth / 2;
    const nextScroll = Math.max(0, Math.min(maxScroll, target));
    scrollRef.current.scrollLeft = nextScroll;
  }, [data, elapsedSeconds, durationSeconds]);

  const handleSeek = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current || !canvasRef.current || durationSeconds <= 0) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left + scrollRef.current.scrollLeft;
    const width = canvasRef.current.width || 1;
    const ratio = Math.min(Math.max(clickX / width, 0), 1);
    onSeek(ratio * durationSeconds);
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-sm text-white/70">
        <span>{formatLabel(elapsedSeconds)}</span>
        <span>{formatLabel(durationSeconds)}</span>
      </div>
      <div
        ref={scrollRef}
        className="relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40"
        onClick={handleSeek}
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/35 via-transparent to-black/35" />
        <div className="absolute inset-0 flex select-none" style={{ width: canvasWidth || 600 }}>
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-white/60"
          style={{ display: isPlaying ? "block" : "block", opacity: isPlaying ? 1 : 0.6 }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs uppercase tracking-[0.2rem] text-white/70">
            Analyzing…
          </div>
        )}
      </div>
    </div>
  );
}

function drawBuckets(
  ctx: CanvasRenderingContext2D,
  buckets: WaveformBucket[],
  width: number,
  height: number,
) {
  const halfHeight = height / 2;
  const barWidth = width / buckets.length;
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  buckets.forEach((bucket, index) => {
    const x = index * barWidth;
    const lowHeight = (bucket.low / 255) * halfHeight;
    const midHeight = (bucket.mid / 255) * halfHeight;
    const highHeight = (bucket.high / 255) * halfHeight;

    drawBar(ctx, x, barWidth, halfHeight, lowHeight, "rgba(255, 64, 64, 0.35)");
    drawBar(ctx, x, barWidth, halfHeight, midHeight, "rgba(74, 222, 128, 0.35)");
    drawBar(ctx, x, barWidth, halfHeight, highHeight, "rgba(125, 211, 252, 0.45)");
  });

  ctx.globalCompositeOperation = "source-over";
}

function drawEmpty(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  halfHeight: number,
  magnitude: number,
  color: string,
) {
  if (magnitude <= 0) return;
  ctx.fillStyle = color;
  const topY = halfHeight - magnitude;
  ctx.fillRect(x, topY, width, magnitude);
  ctx.fillRect(x, halfHeight, width, magnitude);
}

function formatLabel(value: number) {
  const safe = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safe / 60);
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
