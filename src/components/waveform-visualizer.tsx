import { useEffect, useMemo, useRef, useState } from "react";

import { useWaveform } from "@/hooks/use-waveform";
import { cn } from "@/lib/utils";
import type { FrequencyBands } from "@/lib/waveform";

export type WaveformVisualizerProps = {
  trackId?: string;
  progress?: number;
  variant?: "thumbnail" | "full" | "bar";
  className?: string;
};

export function WaveformVisualizer({
  trackId,
  progress = 0,
  variant = "thumbnail",
  className,
}: WaveformVisualizerProps) {
  const { data, isLoading, isError } = useWaveform(trackId);
  const segments = data?.segments ?? [];
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

  const bandSeries = useMemo(() => {
    if (!segments.length) return null;
    const low: number[] = [];
    const mid: number[] = [];
    const high: number[] = [];
    segments.forEach((segment) => {
      const envelopes = segment.envelopes ?? {
        low: segment.amplitude * segment.bands.low,
        mid: segment.amplitude * segment.bands.mid,
        high: segment.amplitude * segment.bands.high,
      };
      low.push(envelopes.low);
      mid.push(envelopes.mid);
      high.push(envelopes.high);
    });
    return { low, mid, high } as Record<keyof FrequencyBands, number[]>;
  }, [segments]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bandSeries) return;
    const { width, height } = canvasSize;
    if (width === 0 || height === 0) return;

    const devicePixelRatio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(devicePixelRatio, devicePixelRatio);
    context.clearRect(0, 0, width, height);

    drawWaveform(context, {
      width,
      height,
      series: bandSeries,
      progress: safeProgress,
    });
  }, [bandSeries, canvasSize, safeProgress]);

  const containerClasses = cn(
    "relative isolate overflow-hidden rounded-xl border border-white/15 bg-black/40",
    variant === "full" && "h-full w-full",
    variant === "thumbnail" && "h-full w-full",
    variant === "bar" && "h-16 w-full",
    className,
  );

  return (
    <div ref={containerRef} className={containerClasses}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-white/5" />
      <div className="relative flex h-full w-full items-center justify-center">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {segments.length === 0 && (
          <div className="relative z-10 flex h-full w-full items-center justify-center text-[0.55rem] uppercase tracking-[0.2rem] text-white/40">
            {isLoading && !isError ? "Analyzing" : "No Data"}
          </div>
        )}
      </div>
      {segments.length > 0 && (
        <span
          className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-white"
          style={{
            left: `${Math.min(safeProgress, 1) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

type BandKey = keyof FrequencyBands;

type BandSeries = Record<BandKey, number[]>;

const BAND_STYLES: Record<BandKey, { color: string; baseline: number; span: number }> = {
  low: { color: "#0b6ef3", baseline: 0.95, span: 0.55 },
  mid: { color: "#f4a236", baseline: 0.65, span: 0.5 },
  high: { color: "#ffffff", baseline: 0.28, span: 0.4 },
};

function drawWaveform(
  context: CanvasRenderingContext2D,
  {
    width,
    height,
    series,
    progress,
  }: {
    width: number;
    height: number;
    series: BandSeries;
    progress: number;
  },
) {
  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.65)";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "screen";

  drawBands(context, width, height, series, 0.35);

  if (progress > 0) {
    context.save();
    context.beginPath();
    context.rect(0, 0, width * Math.min(progress, 1), height);
    context.clip();
    drawBands(context, width, height, series, 0.95);
    context.restore();
  }

  context.restore();
}

function drawBands(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  series: BandSeries,
  opacity: number,
) {
  (Object.keys(BAND_STYLES) as BandKey[]).forEach((band) => {
    const values = series[band];
    if (!values?.length) return;
    const { color, baseline, span } = BAND_STYLES[band];
    const anchor = height * baseline;
    const range = height * span;
    context.beginPath();
    context.moveTo(0, anchor);
    const step = values.length > 1 ? width / (values.length - 1) : width;
    for (let index = 0; index < values.length; index++) {
      const x = index * step;
      const amount = clamp(values[index] ?? 0, 0, 1);
      const y = anchor - amount * range;
      context.lineTo(x, y);
    }
    context.lineTo(width, anchor);
    context.closePath();
    context.fillStyle = color;
    context.globalAlpha = opacity;
    context.fill();
  });
  context.globalAlpha = 1;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
