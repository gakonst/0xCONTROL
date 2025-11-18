import { useEffect, useRef, useState } from "react";

import { useWaveform } from "@/hooks/use-waveform";
import { cn } from "@/lib/utils";
import type { BandFrame } from "@/lib/waveform";

export type WaveformVisualizerProps = {
  trackId?: string;
  progress?: number;
  variant?: "thumbnail" | "full" | "bar";
  className?: string;
  bpm?: number;
  beatsPerBar?: number;
};

export function WaveformVisualizer({
  trackId,
  progress = 0,
  variant = "thumbnail",
  className,
  bpm,
  beatsPerBar = 4,
}: WaveformVisualizerProps) {
  const { data, isLoading, isError } = useWaveform(trackId);
  const frames = data?.frames ?? [];
  const durationSeconds = data?.durationSeconds ?? 0;
  const safeProgress = Number.isFinite(progress)
    ? Math.min(Math.max(progress, 0), 1)
    : 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleResize = () => updateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvasSize;
    const devicePixelRatio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(devicePixelRatio, devicePixelRatio);

    if (!frames.length || width === 0 || height === 0) {
      drawEmptyState(context, width, height);
      return;
    }

    drawRainbowWaveform(context, {
      width,
      height,
      frames,
      progress: safeProgress,
      durationSeconds,
      bpm,
      beatsPerBar,
    });
  }, [frames, canvasSize, safeProgress, bpm, beatsPerBar, durationSeconds]);

  const containerClasses = cn(
    "relative isolate overflow-hidden rounded-2xl border border-white/15 bg-black/70",
    variant === "full" && "h-full w-full",
    variant === "thumbnail" && "h-full w-full",
    variant === "bar" && "h-16 w-full",
    className,
  );

  const hasFrames = frames.length > 0;
  const statusLabel = isLoading && !isError ? "Analyzing" : "No Data";

  return (
    <div ref={containerRef} className={containerClasses}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!hasFrames && (
        <div className="relative z-10 flex h-full w-full items-center justify-center text-[0.55rem] uppercase tracking-[0.2rem] text-white/40">
          {statusLabel}
        </div>
      )}
    </div>
  );
}

type WaveformDrawOptions = {
  width: number;
  height: number;
  frames: BandFrame[];
  progress: number;
  durationSeconds: number;
  bpm?: number;
  beatsPerBar?: number;
};

const BAND_COLORS: Record<keyof BandFrame, [number, number, number]> = {
  bass: [1.0, 0, 0],
  melody: [0, 0.4, 1.0],
  voice: [0, 1.0, 0.4],
  hats: [1.0, 1.0, 1.0],
};

const BAND_EMPHASIS: Record<keyof BandFrame, number> = {
  bass: 1.4,
  melody: 1,
  voice: 1,
  hats: 0.85,
};

function drawRainbowWaveform(
  context: CanvasRenderingContext2D,
  options: WaveformDrawOptions,
) {
  const { width, height, frames, progress, durationSeconds, bpm, beatsPerBar } =
    options;
  if (!frames.length || width === 0 || height === 0) return;

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#050505");
  gradient.addColorStop(1, "#010101");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const centerY = height / 2;
  const maxAmplitude = height * 0.45;
  let previousAmplitude = 0;

  for (let x = 0; x < width; x++) {
    const frame = aggregateFramesForColumn(frames, x, width);
    const { color, intensity, opacity } = mixBandColors(frame);
    const amplitude = intensityToAmplitude(intensity);
    const eased = previousAmplitude + (amplitude - previousAmplitude) * 0.6;
    previousAmplitude = eased;
    const columnHeight = Math.max(1, eased * maxAmplitude);
    context.fillStyle = color;
    context.globalAlpha = opacity;
    context.fillRect(x, centerY - columnHeight, 1, columnHeight * 2);
  }

  context.globalAlpha = 1;

  const playedWidth = Math.max(0, Math.min(progress, 1) * width);
  if (playedWidth > 0) {
    context.fillStyle = "rgba(255,255,255,0.06)";
    context.fillRect(0, 0, playedWidth, height);
  }

  drawBeatMarkers(context, {
    width,
    height,
    bpm,
    beatsPerBar,
    durationSeconds,
  });

  if (progress > 0) {
    const playheadX = Math.min(progress, 1) * width;
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(playheadX + 0.5, 0);
    context.lineTo(playheadX + 0.5, height);
    context.stroke();
  }
}

function drawEmptyState(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255,255,255,0.05)");
  gradient.addColorStop(1, "rgba(0,0,0,0.8)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function aggregateFramesForColumn(
  frames: BandFrame[],
  columnIndex: number,
  width: number,
): BandFrame {
  if (frames.length === 1) return frames[0]!;
  const framesPerPixel = frames.length / Math.max(1, width);
  const startIndex = Math.min(
    frames.length - 1,
    Math.floor(columnIndex * framesPerPixel),
  );
  let endIndex = Math.floor((columnIndex + 1) * framesPerPixel);
  if (endIndex <= startIndex) {
    endIndex = startIndex + 1;
  }
  const safeEnd = Math.min(frames.length, endIndex);
  const count = Math.max(1, safeEnd - startIndex);
  const aggregate: BandFrame = { bass: 0, melody: 0, voice: 0, hats: 0 };

  for (let index = startIndex; index < safeEnd; index++) {
    const frame = frames[index]!;
    aggregate.bass += frame.bass;
    aggregate.melody += frame.melody;
    aggregate.voice += frame.voice;
    aggregate.hats += frame.hats;
  }

  const scale = 1 / count;
  aggregate.bass *= scale;
  aggregate.melody *= scale;
  aggregate.voice *= scale;
  aggregate.hats *= scale;
  return aggregate;
}

function mixBandColors(frame: BandFrame) {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  (Object.keys(BAND_COLORS) as (keyof BandFrame)[]).forEach((band) => {
    const weight = frame[band] * BAND_EMPHASIS[band]!;
    if (weight <= 0) return;
    const [cr, cg, cb] = BAND_COLORS[band]!;
    r += cr * weight;
    g += cg * weight;
    b += cb * weight;
    total += weight;
  });

  if (total <= 0) {
    return { color: "rgba(255,255,255,0.08)", intensity: 0, opacity: 0.15 };
  }

  const inv = 1 / total;
  const color = `rgb(${Math.round(r * inv * 255)}, ${Math.round(g * inv * 255)}, ${Math.round(b * inv * 255)})`;
  const clampedTotal = Math.min(total, 1.6);
  const intensity = clamp01(clampedTotal / 1.2);
  const opacity = 0.35 + 0.4 * (clampedTotal / 1.6);
  return { color, intensity, opacity };
}

function intensityToAmplitude(intensity: number): number {
  if (intensity <= 0) return 0;
  return Math.pow(intensity, 0.85);
}

type BeatMarkerOptions = {
  width: number;
  height: number;
  bpm?: number;
  beatsPerBar?: number;
  durationSeconds: number;
};

function drawBeatMarkers(
  context: CanvasRenderingContext2D,
  options: BeatMarkerOptions,
) {
  const { width, height, bpm, beatsPerBar = 4, durationSeconds } = options;
  if (!bpm || bpm <= 0 || durationSeconds <= 0) return;

  const beatSeconds = 60 / bpm;
  if (!Number.isFinite(beatSeconds) || beatSeconds <= 0) return;

  const beatPixelSpacing = (beatSeconds / durationSeconds) * width;
  const drawBeats = beatPixelSpacing >= 6;
  const totalBeats = Math.ceil(durationSeconds / beatSeconds);
  const top = height * 0.08;
  const bottom = height * 0.92;

  context.save();
  context.translate(0.5, 0);
  for (let beatIndex = 0; beatIndex <= totalBeats; beatIndex++) {
    const time = beatIndex * beatSeconds;
    const x = (time / durationSeconds) * width;
    if (x > width + 1) break;
    const isBar = beatsPerBar > 0 && beatIndex % beatsPerBar === 0;
    if (!isBar && !drawBeats) continue;

    context.strokeStyle = isBar
      ? "rgba(255,255,255,0.35)"
      : "rgba(255,255,255,0.15)";
    context.lineWidth = isBar ? 1.25 : 1;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();

    if (isBar) {
      drawMarkerTriangles(context, x - 0.5, top, bottom);
    }
  }
  context.restore();
}

function drawMarkerTriangles(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
) {
  const triangleWidth = 6;
  const triangleHeight = 4;
  context.save();
  context.fillStyle = "#ff3b3b";
  context.beginPath();
  context.moveTo(x - triangleWidth / 2, top);
  context.lineTo(x + triangleWidth / 2, top);
  context.lineTo(x, Math.max(0, top - triangleHeight));
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(x - triangleWidth / 2, bottom);
  context.lineTo(x + triangleWidth / 2, bottom);
  context.lineTo(x, bottom + triangleHeight);
  context.closePath();
  context.fill();
  context.restore();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
