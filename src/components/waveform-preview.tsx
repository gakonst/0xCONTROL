import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useTrackWaveform } from "@/hooks/use-track-waveform";
import type { WaveformBucket } from "@/data/tracks";

type WaveformPreviewProps = {
  trackId: string;
  className?: string;
  isActive?: boolean;
};

const WIDTH = 220;
const HEIGHT = 56;

export function WaveformPreview({ trackId, className, isActive }: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { data, isLoading } = useTrackWaveform(trackId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const buckets = data?.overview?.buckets ?? [];
    if (!buckets.length) {
      drawPlaceholder(ctx, canvas.width, canvas.height);
      return;
    }

    drawBuckets(ctx, buckets, canvas.width, canvas.height, {
      accentColor: isActive ? "rgba(255,255,255,0.85)" : "rgba(148,163,184,0.9)",
    });
  }, [data, isActive]);

  return (
    <div
      className={cn(
        "relative flex h-12 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/30 px-1 md:h-14 md:w-48",
        isActive ? "border-white/40 bg-white/5" : "border-white/10",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="h-full w-full"
        aria-label="Waveform preview"
      />
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 text-[0.65rem] uppercase tracking-[0.2rem] text-white/70">
          <div className="flex h-full w-full items-center justify-center">Analyzing…</div>
        </div>
      )}
    </div>
  );
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "rgba(15,23,42,0.7)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawBuckets(
  ctx: CanvasRenderingContext2D,
  buckets: WaveformBucket[],
  width: number,
  height: number,
  options: { accentColor: string },
) {
  const barWidth = width / buckets.length;
  const halfHeight = height / 2;
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  buckets.forEach((bucket, index) => {
    const x = index * barWidth;
    const lowHeight = (bucket.low / 255) * halfHeight;
    const midHeight = (bucket.mid / 255) * halfHeight;
    const highHeight = (bucket.high / 255) * halfHeight;

    drawBar(ctx, x, barWidth, halfHeight, lowHeight, "rgba(248,113,113,0.55)");
    drawBar(ctx, x, barWidth, halfHeight, midHeight, "rgba(74,222,128,0.45)");
    drawBar(ctx, x, barWidth, halfHeight, highHeight, options.accentColor);
  });

  ctx.globalCompositeOperation = "source-over";
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
