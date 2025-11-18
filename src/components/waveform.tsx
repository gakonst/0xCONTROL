import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { BandFrame, WaveData } from "@/types/waveform";

type WaveformProps = {
  waveData?: WaveData | null;
  currentTime?: number;
  beatMarkers?: number[];
  barMarkers?: number[];
  className?: string;
  variant?: "card" | "flat";
};

const BAND_COLORS: Record<keyof BandFrame, [number, number, number]> = {
  bass: [1, 0, 0],
  melody: [0, 0.4, 1],
  voice: [0, 1, 0.4],
  hats: [1, 1, 1],
};

const EMPHASIS: Record<keyof BandFrame, number> = {
  bass: 1.4,
  melody: 1,
  voice: 1,
  hats: 0.8,
};

const BAND_KEYS: (keyof BandFrame)[] = ["bass", "melody", "voice", "hats"];

export function Waveform({
  waveData,
  currentTime,
  beatMarkers,
  barMarkers,
  className,
  variant = "card",
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDimensions({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const duration = useMemo(() => {
    if (!waveData || !waveData.sampleRate) return 0;
    return waveData.frames.length / waveData.sampleRate;
  }, [waveData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = dimensions;
    if (!width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    drawBackground(ctx, width, height, variant);
    if (waveData && waveData.frames.length) {
      drawWaveform({
        ctx,
        width,
        height,
        waveData,
        beatMarkers,
        barMarkers,
        currentTime,
        duration,
      });
    } else {
      drawPlaceholder(ctx, width, height);
    }
    ctx.restore();
  }, [waveData, dimensions, beatMarkers, barMarkers, currentTime, duration, variant]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden",
        variant === "card"
          ? "rounded-lg border border-white/10 bg-black/80"
          : "bg-transparent",
        className,
      )}
    >
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
    </div>
  );
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: "card" | "flat",
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle =
    variant === "card" ? "rgba(0,0,0,0.95)" : "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, width, height);
}

type DrawWaveformOptions = {
  ctx: CanvasRenderingContext2D;
  waveData: WaveData;
  width: number;
  height: number;
  beatMarkers?: number[];
  barMarkers?: number[];
  currentTime?: number;
  duration: number;
};

function drawWaveform({
  ctx,
  waveData,
  width,
  height,
  beatMarkers,
  barMarkers,
  currentTime,
  duration,
}: DrawWaveformOptions) {
  const frames = waveData.frames;
  if (!frames.length) return;

  const centerY = height / 2;
  const maxAmplitude = height * 0.45;
  const framesPerPixel = frames.length / width;

  ctx.lineCap = "round";
  let smoothed = 0;
  for (let x = 0; x < width; x++) {
    const startIndex = Math.floor(x * framesPerPixel);
    const endIndex = Math.min(
      frames.length,
      Math.floor((x + 1) * framesPerPixel) || startIndex + 1,
    );
    const aggregated = aggregateFrames(frames, startIndex, endIndex);
    const { color, totalEnergy } = mixBandColors(aggregated);
    const columnAmplitude = Math.min(totalEnergy, 1);
    smoothed = smoothed * 0.7 + columnAmplitude * 0.3;
    const columnHeight = smoothed * maxAmplitude;

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, centerY - columnHeight);
    ctx.lineTo(x + 0.5, centerY + columnHeight);
    ctx.stroke();
  }

  const markers = barMarkers ?? beatMarkers;
  if (markers && markers.length && duration > 0) {
    markers.forEach((time) => drawMarker(ctx, time, duration, width, height));
  }

  if (typeof currentTime === "number" && duration > 0) {
    const playheadX = Math.min((currentTime / duration) * width, width);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, 0);
    ctx.lineTo(playheadX + 0.5, height);
    ctx.stroke();
  }
}

function aggregateFrames(
  frames: BandFrame[],
  startIndex: number,
  endIndex: number,
): BandFrame {
  const safeStart = Math.min(Math.max(startIndex, 0), frames.length - 1);
  const safeEnd = Math.min(Math.max(endIndex, safeStart + 1), frames.length);
  const total: BandFrame = { bass: 0, melody: 0, voice: 0, hats: 0 };

  for (let index = safeStart; index < safeEnd; index++) {
    const frame = frames[index];
    total.bass += frame.bass;
    total.melody += frame.melody;
    total.voice += frame.voice;
    total.hats += frame.hats;
  }

  const count = safeEnd - safeStart || 1;
  return {
    bass: total.bass / count,
    melody: total.melody / count,
    voice: total.voice / count,
    hats: total.hats / count,
  };
}

function mixBandColors(frame: BandFrame) {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;

  BAND_KEYS.forEach((band) => {
    const weight = frame[band] * EMPHASIS[band];
    const [cr, cg, cb] = BAND_COLORS[band];
    r += cr * weight;
    g += cg * weight;
    b += cb * weight;
    total += weight;
  });

  if (total > 0) {
    r /= total;
    g /= total;
    b /= total;
  }

  const alpha = 0.4 + 0.6 * Math.min(total, 1);
  return {
    color: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha.toFixed(2)})`,
    totalEnergy: Math.min(frame.bass + frame.melody + frame.voice + frame.hats, 1),
  };
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  time: number,
  duration: number,
  width: number,
  height: number,
) {
  const position = Math.min(time / duration, 1);
  const markerX = position * width;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(markerX + 0.5, height * 0.08);
  ctx.lineTo(markerX + 0.5, height * 0.92);
  ctx.stroke();

  const triangleHeight = 5;
  const triangleWidth = 6;
  ctx.fillStyle = "rgba(255,64,64,0.8)";
  ctx.beginPath();
  ctx.moveTo(markerX, height * 0.08);
  ctx.lineTo(markerX - triangleWidth / 2, height * 0.08 - triangleHeight);
  ctx.lineTo(markerX + triangleWidth / 2, height * 0.08 - triangleHeight);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(markerX, height * 0.92);
  ctx.lineTo(markerX - triangleWidth / 2, height * 0.92 + triangleHeight);
  ctx.lineTo(markerX + triangleWidth / 2, height * 0.92 + triangleHeight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const centerY = height / 2;
  const maxAmplitude = height * 0.35;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0.25)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.05)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0.3)");
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";

  for (let x = 0; x < width; x += 2) {
    const amplitude = Math.sin((x / width) * Math.PI) * 0.5 + 0.5;
    const columnHeight = amplitude * maxAmplitude;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, centerY - columnHeight);
    ctx.lineTo(x + 0.5, centerY + columnHeight);
    ctx.stroke();
  }
}
