import { useMemo } from "react";

import { useWaveform } from "@/hooks/use-waveform";
import { cn } from "@/lib/utils";

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
  const activeIndex = Math.floor(safeProgress * segments.length);

  const segmentHeights = useMemo(() => {
    if (!segments.length) return [];
    return segments.map((segment) => {
      const normalized = Math.max(0.08, Math.min(segment.amplitude, 1));
      const baseHeight = variant === "full" ? 100 : 90;
      return normalized * baseHeight;
    });
  }, [segments, variant]);

  const containerClasses = cn(
    "relative isolate overflow-hidden rounded-xl border border-white/15 bg-black/40",
    variant === "full" && "h-full w-full",
    variant === "thumbnail" && "h-full w-full",
    variant === "bar" && "h-16 w-full",
    className,
  );

  return (
    <div className={containerClasses}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-white/5" />
      <div className="relative flex h-full w-full items-center justify-center">
        {segments.length > 0 ? (
          <div className="flex h-full w-full items-center gap-[1px] px-1">
            {segments.map((segment, index) => {
              const { low, mid, high } = segment.bands;
              const color = `rgb(${Math.round(low * 255)}, ${Math.round(
                mid * 255,
              )}, ${Math.round(high * 255)})`;
              const opacity = index <= activeIndex ? 0.95 : 0.35;
              return (
                <span
                  key={`${trackId}-${index}`}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${segmentHeights[index] ?? 0}%`,
                    background: color,
                    opacity,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[0.55rem] uppercase tracking-[0.2rem] text-white/40">
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
