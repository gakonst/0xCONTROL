import {
  memo,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { WaveformData } from "@/lib/waveform";
import { clamp } from "@/lib/math";

export type WaveformCanvasProps = {
  waveform: WaveformData | null;
  duration: number;
  bpm?: number | null;
  beatOffsetSeconds?: number | null;
  zoom: number;
  isPlaying: boolean;
  baseCurrentTime: number;
  liveTimeGetter?: () => number;
  onSeek: (ratio: number) => void;
  variant: "overview" | "detail";
  mirror?: boolean;
  fixedCenter?: boolean;
  height?: number;
  className?: string;
  rounded?: boolean;
  showPlayhead?: boolean;
};

function OverviewCanvasComponent(
  props: Omit<WaveformCanvasProps, "variant" | "mirror" | "fixedCenter" | "zoom">,
) {
  return (
    <WaveformCanvas
      {...props}
      variant="overview"
      mirror={false}
      fixedCenter={false}
      zoom={1}
      height={props.height}
    />
  );
}

export function DetailCanvas(
  props: Omit<WaveformCanvasProps, "variant" | "mirror" | "fixedCenter">,
) {
  return (
    <WaveformCanvas
      {...props}
      variant="detail"
      mirror
      fixedCenter
    />
  );
}

export const OverviewCanvas = memo(OverviewCanvasComponent);

function WaveformCanvas({
  waveform,
  duration,
  bpm,
  beatOffsetSeconds,
  zoom,
  mirror,
  fixedCenter,
  variant,
  isPlaying,
  baseCurrentTime,
  liveTimeGetter,
  onSeek,
  height,
  className,
  rounded = true,
  showPlayhead = true,
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);
  const dragStartX = useRef<number | null>(null);
  const dragStartTime = useRef<number | null>(null);
  const dragPreviewTime = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const smoothedCenter = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);

  const isOverview = variant === "overview";
  const effectiveMirror = mirror ?? !isOverview;
  const effectiveFixedCenter = fixedCenter ?? !isOverview;

  const [size, setSize] = useState({
    width: 960,
    height: height ?? (isOverview ? 88 : 320),
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height: rectHeight } = entry.contentRect;
      const targetHeight = height ?? (isOverview
        ? Math.max(56, Math.floor(rectHeight))
        : Math.max(140, Math.floor(rectHeight)));

      // Respect the actual measured width for tiny containers (e.g., list thumbnails)
      // instead of forcing a 320px minimum, but fall back to a sane default when the
      // element is hidden and reports 0.
      const measuredWidth = Math.floor(width);
      const safeWidth = measuredWidth > 0 ? measuredWidth : 320;

      setSize({
        width: Math.max(1, safeWidth),
        height: targetHeight,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [height, isOverview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const midY = size.height / 2;
    const bars = waveform.bars;

    let rafId: number;
    const render = () => {
      const liveTime = liveTimeGetter?.() ?? baseCurrentTime;
      const effectiveTime = dragging.current && dragPreviewTime.current !== null
        ? dragPreviewTime.current
        : liveTime;

      smoothedCenter.current = effectiveTime;
      const centerForView = smoothedCenter.current ?? liveTime;
      const { startSec, endSec, spanSec } = computeViewWindow(
        duration,
        centerForView,
        zoom,
      );

      ctx.clearRect(0, 0, size.width, size.height);

      const amplitudeScale = isOverview ? 1.0 : 0.48;

      for (let x = 0; x < size.width; x += 1) {
        const ratio = x / size.width;
        const time = startSec + ratio * spanSec;
        const norm = clamp(time / Math.max(duration, 0.001), 0, 1);
        const exactIndex = norm * (bars.length - 1);
        const i0 = Math.floor(exactIndex);
        const i1 = Math.min(bars.length - 1, i0 + 1);
        const t = exactIndex - i0;
        const b0 = bars[i0];
        const b1 = bars[i1];
        const amp = lerp(b0.amplitude, b1.amplitude, t);
        const r = lerp(b0.color.r, b1.color.r, t);
        const g = lerp(b0.color.g, b1.color.g, t);
        const b = lerp(b0.color.b, b1.color.b, t);

        const heightPx = amp * (size.height * amplitudeScale);
        const barColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

        ctx.fillStyle = barColor;
        if (effectiveMirror) {
          const topY = midY - heightPx;
          ctx.fillRect(x, topY, 1, heightPx * 2);
        } else {
          const baseY = size.height;
          const topY = baseY - heightPx;
          ctx.fillRect(x, topY, 1, heightPx);
        }
      }

      if (effectiveMirror) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, midY - 0.5, size.width, 1);
      } else {
        const gridY = size.height * 0.68;
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(0, gridY, size.width, 1);
      }

      if (!isOverview) {
        const pixelsPerSecond = size.width / Math.max(spanSec || 0.001, 0.001);
          const offsetSec = startSec;
          const gridTop = 0;
          const gridBottom = size.height;

          if (bpm && bpm > 0 && Number.isFinite(bpm) && duration > 0) {
            const secondsPerBeat = 60 / bpm;
            const beatOffset = beatOffsetSeconds ?? 0;
            const viewStartRelative = offsetSec - beatOffset;
            const epsilon = 1e-6; // keep floating-point error from shifting the grid over time
            const firstBeatIndex = Math.floor(
              (viewStartRelative + epsilon) / secondsPerBeat,
            );
            const firstBeatTime = firstBeatIndex * secondsPerBeat + beatOffset;
            const beats = Math.ceil(spanSec / secondsPerBeat) + 2;
            for (let i = 0; i <= beats; i += 1) {
              const tBeat = firstBeatTime + i * secondsPerBeat;
              const x = Math.round((tBeat - offsetSec) * pixelsPerSecond);
              if (x < -2 || x > size.width + 2) continue;
            const isBar = (firstBeatIndex + i) % 4 === 0;
            ctx.strokeStyle = isBar
              ? "rgba(255,255,255,0.28)"
              : "rgba(255,255,255,0.18)";
            ctx.lineWidth = isBar ? 1.7 : 1.2;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, gridTop);
            ctx.lineTo(x + 0.5, gridBottom);
            ctx.stroke();

            // Mark the downbeat (1st beat of each 4-beat bar) with a small red arrow.
            if (isBar) {
              const arrowSize = 8;
              const half = arrowSize / 2;
              ctx.fillStyle = "#ef4444";
              // Top arrow (faces down): tip lower than base
              ctx.beginPath();
              ctx.moveTo(x + 0.5, gridTop + arrowSize); // tip
              ctx.lineTo(x - half, gridTop);
              ctx.lineTo(x + half, gridTop);
              ctx.closePath();
              ctx.fill();
              // Bottom arrow (faces up): tip higher than base
              ctx.beginPath();
              ctx.moveTo(x + 0.5, gridBottom - arrowSize); // tip
              ctx.lineTo(x - half, gridBottom);
              ctx.lineTo(x + half, gridBottom);
              ctx.closePath();
              ctx.fill();
            }
          }
        } else if (duration > 0) {
          const firstSecond = Math.floor(offsetSec);
          const totalSeconds = Math.ceil(spanSec) + 2;
          for (let s = 0; s <= totalSeconds; s += 1) {
            const tSec = firstSecond + s;
            const x = (tSec - offsetSec) * pixelsPerSecond;
            if (x < -2 || x > size.width + 2) continue;
            const isTen = tSec % 10 === 0;
            ctx.strokeStyle = isTen
              ? "rgba(255,255,255,0.18)"
              : "rgba(255,255,255,0.07)";
            ctx.lineWidth = isTen ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, gridTop);
            ctx.lineTo(x + 0.5, gridBottom);
            ctx.stroke();
          }
        }
      }

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [waveform, size.width, size.height, duration, bpm, beatOffsetSeconds, zoom, effectiveMirror, effectiveFixedCenter, liveTimeGetter, baseCurrentTime, isOverview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      if (zoom <= 1 || duration <= 0 || !effectiveFixedCenter) return;
      event.preventDefault();
      const liveTime = liveTimeGetter?.() ?? baseCurrentTime;
      const { spanSec } = computeViewWindow(duration, liveTime, zoom);
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      const secondsPerPixel = spanSec / Math.max(size.width, 1);
      const deltaSeconds = dominantDelta * secondsPerPixel * 0.5;
      const nextTime = clamp(liveTime + deltaSeconds, 0, duration);
      onSeek(nextTime / Math.max(duration, 0.001));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel as any);
  }, [zoom, duration, baseCurrentTime, liveTimeGetter, size.width, onSeek, effectiveFixedCenter]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const dpr = window.devicePixelRatio || 1;
    overlay.width = size.width * dpr;
    overlay.height = size.height * dpr;
    overlay.style.width = `${size.width}px`;
    overlay.style.height = `${size.height}px`;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let rafId: number;
    const render = () => {
      const liveTime = liveTimeGetter?.() ?? baseCurrentTime;
      const effectiveTime = dragging.current && dragPreviewTime.current !== null
        ? dragPreviewTime.current
        : liveTime;

      const { startSec, endSec, spanSec } = computeViewWindow(
        duration,
        effectiveTime,
        zoom,
      );
      const clampedTime = Math.max(startSec, Math.min(endSec, effectiveTime));
      const ratio = spanSec > 0 ? (clampedTime - startSec) / spanSec : 0;
      const x = effectiveFixedCenter && zoom > 1.01
        ? size.width / 2
        : Math.max(0, Math.min(size.width, ratio * size.width));

      ctx.clearRect(0, 0, size.width, size.height);

      if (showPlayhead) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, size.height);
        ctx.strokeStyle = isPlaying ? "rgba(255,255,255,0.95)" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.shadowColor = isPlaying
          ? "rgba(255,255,255,0.35)"
          : "rgba(239,68,68,0.4)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [duration, isPlaying, liveTimeGetter, baseCurrentTime, size.width, size.height, effectiveFixedCenter, zoom]);

  return (
    <div
      ref={containerRef}
      className={className
        ? `${className} touch-none select-none`
        : `relative w-full ${isOverview ? "h-[96px]" : "h-[320px]"} select-none touch-none`}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 cursor-pointer bg-slate-950 ${rounded ? "rounded-lg" : ""}`}
        onPointerDown={(event: ReactPointerEvent<HTMLCanvasElement>) => {
          if (!duration) return;
          event.preventDefault();
          activePointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          dragStartX.current = event.clientX;
          dragStartTime.current = liveTimeGetter?.() ?? baseCurrentTime;
          if (effectiveFixedCenter && zoom > 1) {
            dragPreviewTime.current = dragStartTime.current;
            event.currentTarget.style.cursor = "grabbing";
          } else {
            dragPreviewTime.current = null;
            event.currentTarget.style.cursor = "pointer";
          }
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLCanvasElement>) => {
          if (!duration) return;
          if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;

          if (dragging.current && effectiveFixedCenter && zoom > 1) {
            const rect = event.currentTarget.getBoundingClientRect();
            const deltaPx = event.clientX - (dragStartX.current ?? event.clientX);
            const { spanSec } = computeViewWindow(
              duration,
              dragStartTime.current ?? baseCurrentTime,
              zoom,
            );
            const secondsPerPixel = spanSec / Math.max(rect.width, 1);
            const nextTime = clamp(
              (dragStartTime.current ?? baseCurrentTime) - deltaPx * secondsPerPixel,
              0,
              duration,
            );
            dragPreviewTime.current = nextTime;
          } else if (dragging.current) {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = clamp(
              (event.clientX - rect.left) / Math.max(rect.width, 1),
              0,
              1,
            );
            onSeek(ratio);
          }
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLCanvasElement>) => {
          if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (dragging.current && effectiveFixedCenter && zoom > 1 && dragPreviewTime.current !== null) {
            suppressNextClick.current = true;
            onSeek(dragPreviewTime.current / Math.max(duration, 0.001));
          } else if (dragging.current && !effectiveFixedCenter) {
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const ratio = clamp(
                (event.clientX - rect.left) / Math.max(rect.width, 1),
                0,
                1,
              );
              onSeek(ratio);
            }
          }
          dragging.current = false;
          dragPreviewTime.current = null;
          activePointerId.current = null;
        }}
        onPointerCancel={(event: ReactPointerEvent<HTMLCanvasElement>) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragging.current = false;
          dragPreviewTime.current = null;
          activePointerId.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = false;
          dragPreviewTime.current = null;
          activePointerId.current = null;
        }}
        onClick={(event) => {
          if (suppressNextClick.current) {
            suppressNextClick.current = false;
            return;
          }
          if (!duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = clamp(
            (event.clientX - rect.left) / Math.max(rect.width, 1),
            0,
            1,
          );
          if (effectiveFixedCenter && zoom > 1) {
            const { startSec, spanSec } = computeViewWindow(
              duration,
              baseCurrentTime,
              zoom,
            );
            const nextTime = startSec + ratio * spanSec;
            onSeek(nextTime / Math.max(duration, 0.001));
          } else {
            onSeek(ratio);
          }
        }}
      />
      <canvas
        ref={overlayRef}
        className={`pointer-events-none absolute inset-0 ${rounded ? "rounded-lg" : ""}`}
      />
    </div>
  );
}

function computeViewWindow(duration: number, centerTime: number, zoom: number) {
  const safeDuration = Math.max(duration, 0.001);
  const spanSec = Math.min(safeDuration, safeDuration / Math.max(zoom, 0.1));
  const half = spanSec / 2;
  let startSec = centerTime - half;
  let endSec = centerTime + half;
  if (spanSec >= safeDuration) {
    startSec = 0;
    endSec = safeDuration;
  }
  return { startSec, endSec, spanSec };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function attachLiveTimeGetter(
  ref: MutableRefObject<HTMLAudioElement | null>,
  fallback: number,
) {
  return () => ref.current?.currentTime ?? fallback;
}
