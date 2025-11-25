import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { buildApiUrl } from "@/lib/api";
import { type WaveformData } from "@/lib/waveform";
// Note: We analyze waveforms in the browser using the Web Audio API. No ffmpeg wasm needed here.

type TrackSource = {
  label: string;
  url: string;
  originalName?: string;
  bpm?: number | null;
  /** fetches the raw audio bytes to decode */
  fetchArrayBuffer: () => Promise<ArrayBuffer>;
};

type CatalogRecord = {
  id?: string;
  path?: string;
  name?: string;
  artist?: string;
  durationSeconds?: number | null;
  bpm?: number | null;
};

export function WaveformPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [beatOffsetSeconds, setBeatOffsetSeconds] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>("none");
  const [catalog, setCatalog] = useState<TrackSource[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackSource | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [zoom, setZoom] = useState(8.0); // detail pane default 8x

  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      setIsLoadingCatalog(true);
      try {
        const response = await fetch(buildApiUrl("/api/catalog"), {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`catalog status ${response.status}`);
        const payload = (await response.json()) as { tracks?: CatalogRecord[] };
        if (cancelled) return;
        const sources = (payload.tracks ?? [])
          .map(buildR2SourceFromCatalog)
          .filter(Boolean) as TrackSource[];
        setCatalog(sources);
        setSelectedTrack((prev) => prev ?? sources[0] ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error("catalog load failed", error);
        }
      } finally {
        if (!cancelled) setIsLoadingCatalog(false);
      }
    };

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  // Spacebar play/pause toggle (when not typing in inputs)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      event.preventDefault();
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadSource = useCallback(
    async (source: TrackSource) => {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setWaveform(null);
      setActiveSourceLabel(source.label);

      try {
        const analyzed = await analyzeWithWorker(source);
        if (!analyzed) {
          throw new Error("Unable to analyze waveform (analyzer unavailable).");
        }
        setWaveform(analyzed.waveform);
        setDuration(analyzed.waveform.durationSeconds);
        setBpm(analyzed.bpm ?? null);
        setBeatOffsetSeconds(analyzed.beatOffsetSeconds ?? null);
        setCurrentTime(0);

        const audio = audioRef.current;
        if (audio) {
          audio.src = source.url;
          audio.currentTime = 0;
          await audio.play().catch(() => {
            /* ignored; user gesture may be needed */
          });
          audio.pause();
        }
      } catch (error) {
        console.error("waveform analysis failed", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        setAnalysisError(message);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [],
  );

  // Analyze whenever selection changes.
  useEffect(() => {
    if (selectedTrack) {
      void loadSource(selectedTrack);
    }
  }, [selectedTrack, loadSource]);

  const liveTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const formattedTime = useMemo(
    () => formatClock(currentTime) + " / " + formatClock(duration),
    [currentTime, duration],
  );

  const hasWaveform = waveform && waveform.bars.length > 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#05070f] via-[#0a0f1d] to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Waveform Lab</p>
          <h1 className="text-3xl font-semibold text-white drop-shadow">Rekordbox-style RGB waveform</h1>
          <p className="max-w-3xl text-slate-300">
            Bass → red, voice → green, melody → blue, air → white. Click the waveform to seek.
            The playhead is white while playing and turns red when paused.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <label className="text-xs uppercase tracking-wide text-slate-400">Catalog</label>
              <select
                className="min-w-[280px] rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-slate-900/40 focus:border-indigo-300 focus:outline-none"
                disabled={!catalog.length || isLoadingCatalog || isAnalyzing}
                value={selectedTrack?.originalName ?? ""}
                onChange={(event) => {
                  const next = catalog.find((c) => c.originalName === event.target.value) ?? null;
                  setSelectedTrack(next);
                }}
              >
                <option value="" disabled>
                  {isLoadingCatalog ? "Loading tracks…" : "Select a track"}
                </option>
                {catalog.map((entry) => (
                  <option key={entry.originalName ?? entry.label} value={entry.originalName ?? entry.label}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-200">
              <Pill>{activeSourceLabel === "none" ? "No track loaded" : activeSourceLabel}</Pill>
              {isAnalyzing && <PulseDot label="Analyzing" />}
              {!isAnalyzing && hasWaveform && <span className="text-emerald-300">Ready</span>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                if (audio.paused) {
                  audio.play().catch(() => {});
                } else {
                  audio.pause();
                }
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg shadow-slate-900/50 transition hover:-translate-y-0.5 active:translate-y-0"
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>

          <div className="flex flex-col text-sm text-slate-300">
            <span className="font-semibold text-white">{formattedTime}</span>
            <span className="text-xs text-slate-400">Click waveform to jump</span>
          </div>

            <div className="ml-auto flex items-center gap-3 text-xs uppercase tracking-wide text-slate-300">
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="text-slate-400">Zoom</span>
                <input
                  type="range"
                  min={0.5}
                  max={16}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="accent-indigo-300 h-2 w-28 cursor-pointer appearance-none rounded-full bg-slate-800"
                />
                <span className="text-slate-200">{zoom.toFixed(1)}×</span>
              </div>
              <Pill subtle>{catalog.length ? `${catalog.length} tracks` : "Loading…"}</Pill>
              <Pill subtle>{isPlaying ? "Playing" : "Paused"}</Pill>
              <Pill subtle>{bpm ? `${bpm} BPM` : "BPM analyzing"}</Pill>
            </div>
          </div>

          <div className="space-y-4">
            {/* Overview pane */}
            <PaneLabel>Overview</PaneLabel>
            <WaveformCanvas
              compact
              mirror={false}
              fixedCenter={false}
              waveform={waveform}
              duration={duration}
              bpm={bpm ?? selectedTrack?.bpm ?? null}
              beatOffsetSeconds={beatOffsetSeconds}
              zoom={1}
              isPlaying={isPlaying}
              baseCurrentTime={currentTime}
              liveTimeGetter={liveTime}
              onSeek={(position) => {
                const audio = audioRef.current;
                if (!audio || !duration) return;
                const nextTime = clamp(position * duration, 0, duration);
                audio.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
            />

            {/* Zoomed detail pane */}
            <PaneLabel>Detail (8× default)</PaneLabel>
            <WaveformCanvas
              mirror
              fixedCenter
              waveform={waveform}
              duration={duration}
              bpm={bpm ?? selectedTrack?.bpm ?? null}
              beatOffsetSeconds={beatOffsetSeconds}
              zoom={zoom}
              isPlaying={isPlaying}
              baseCurrentTime={currentTime}
              liveTimeGetter={liveTime}
              onSeek={(position) => {
                const audio = audioRef.current;
                if (!audio || !duration) return;
                const nextTime = clamp(position * duration, 0, duration);
                audio.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
            />
          </div>

          <audio
            ref={audioRef}
            className="hidden"
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? duration)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {analysisError && (
            <div className="mt-4 rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              Waveform analysis failed: {analysisError}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Pill({ children, subtle = false }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        subtle
          ? "border border-slate-800/70 bg-slate-900/70 text-slate-300"
          : "border border-slate-700/80 bg-slate-800/80 text-slate-100"
      }`}
    >
      {children}
    </span>
  );
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{children}</div>;
}

type PulseDotProps = { label: string };

function PulseDot({ label }: PulseDotProps) {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-200">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-300" />
      </span>
      {label}
    </span>
  );
}

type WaveformCanvasProps = {
  waveform: WaveformData | null;
  duration: number;
  bpm?: number | null;
  beatOffsetSeconds?: number | null;
  zoom: number;
  isPlaying: boolean;
  baseCurrentTime: number;
  liveTimeGetter?: () => number;
  onSeek: (ratio: number) => void;
};

function WaveformCanvas({
  waveform,
  duration,
  bpm,
  beatOffsetSeconds,
  zoom,
  mirror = true,
  fixedCenter = false,
  compact = false,
  isPlaying,
  baseCurrentTime,
  liveTimeGetter,
  onSeek,
}: WaveformCanvasProps & { mirror?: boolean; fixedCenter?: boolean; compact?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);
  const dragStartX = useRef<number | null>(null);
  const dragStartTime = useRef<number | null>(null);
  const dragPreviewTime = useRef<number | null>(null);
  const suppressNextClick = useRef(false);
  const smoothedCenter = useRef<number | null>(null);

  const [size, setSize] = useState({ width: 960, height: compact ? 110 : 320 });

  // Track resize to keep canvas crisp.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const targetHeight = compact ? Math.max(96, Math.floor(height)) : Math.max(180, Math.floor(height));
      setSize({
        width: Math.max(320, Math.floor(width)),
        height: targetHeight,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Render waveform with rAF for smooth motion tied to actual playback time.
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
      const effectiveTime = dragging.current && dragPreviewTime.current !== null ? dragPreviewTime.current : liveTime;

      // Snap immediately: no smoothing glide even while playing
      smoothedCenter.current = effectiveTime;

      const centerForView = smoothedCenter.current ?? liveTime;

      const { startSec, endSec, spanSec } = computeViewWindow(
        duration,
        centerForView,
        zoom,
      );

      ctx.clearRect(0, 0, size.width, size.height);

      const amplitudeScale = compact ? 0.6 : 0.48;

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

        const height = amp * (size.height * amplitudeScale);
        const barColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

        ctx.fillStyle = barColor;
        if (mirror) {
          const topY = midY - height;
          ctx.fillRect(x, topY, 1, height * 2);
        } else {
          const baseY = size.height;
          const topY = baseY - height;
          ctx.fillRect(x, topY, 1, height);
        }
      }

      // soft glow overlay
      if (mirror) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, midY - 0.5, size.width, 1);
      } else {
        const gridY = size.height * 0.68; // lower grid for compact overview only
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(0, gridY, size.width, 1);
      }

      // Beat grid (preferred) or seconds grid fallback using the current view window span
      const pixelsPerSecond = size.width / Math.max(spanSec || 0.001, 0.001);
      const offsetSec = startSec; // grid scrolls with window start
      if (bpm && bpm > 0 && Number.isFinite(bpm) && duration > 0) {
        const secondsPerBeat = 60 / bpm;
        const beatOffset = beatOffsetSeconds ?? 0;
        const viewStartRelative = offsetSec - beatOffset;
        const firstBeatIndex = Math.floor(viewStartRelative / secondsPerBeat);
        const firstBeatTime = firstBeatIndex * secondsPerBeat + beatOffset;
        const beats = Math.ceil(spanSec / secondsPerBeat) + 2;
        for (let i = 0; i <= beats; i += 1) {
          const tBeat = firstBeatTime + i * secondsPerBeat;
          const x = (tBeat - offsetSec) * pixelsPerSecond;
          if (x < -2 || x > size.width + 2) continue;
          const isBar = (firstBeatIndex + i) % 4 === 0;
          ctx.strokeStyle = isBar ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)";
          ctx.lineWidth = isBar ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, size.height);
          ctx.stroke();
        }
      } else if (duration > 0) {
        const firstSecond = Math.floor(offsetSec);
        const totalSeconds = Math.ceil(spanSec) + 2;
        for (let s = 0; s <= totalSeconds; s += 1) {
          const tSec = firstSecond + s;
          const x = (tSec - offsetSec) * pixelsPerSecond;
          if (x < -2 || x > size.width + 2) continue;
          const isTen = tSec % 10 === 0;
          ctx.strokeStyle = isTen ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)";
          ctx.lineWidth = isTen ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, size.height);
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [waveform, size.width, size.height, duration, bpm, beatOffsetSeconds, zoom, mirror, fixedCenter, liveTimeGetter, baseCurrentTime]);

  // Smooth pan/scroll when zoomed in.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      if (zoom <= 1 || duration <= 0 || !fixedCenter) return;
      event.preventDefault();
      const liveTime = liveTimeGetter?.() ?? baseCurrentTime;
      const { spanSec } = computeViewWindow(duration, liveTime, zoom);
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const secondsPerPixel = spanSec / Math.max(size.width, 1);
      const deltaSeconds = dominantDelta * secondsPerPixel * 0.5; // tune feel
      const nextTime = clamp(liveTime + deltaSeconds, 0, duration);
      onSeek(nextTime / Math.max(duration, 0.001));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel as any);
  }, [zoom, duration, baseCurrentTime, liveTimeGetter, size.width, onSeek]);

  // Render playhead overlay separate for smooth updates.
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
      const effectiveTime = dragging.current && dragPreviewTime.current !== null ? dragPreviewTime.current : liveTime;

      const { startSec, endSec, spanSec } = computeViewWindow(duration, effectiveTime, zoom);
      const clampedTime = Math.max(startSec, Math.min(endSec, effectiveTime));
      const ratio = spanSec > 0 ? (clampedTime - startSec) / spanSec : 0;
      const x = fixedCenter && zoom > 1.01 ? size.width / 2 : Math.max(0, Math.min(size.width, ratio * size.width));

      ctx.clearRect(0, 0, size.width, size.height);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size.height);
      ctx.strokeStyle = isPlaying ? "rgba(255,255,255,0.95)" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.shadowColor = isPlaying ? "rgba(255,255,255,0.35)" : "rgba(239,68,68,0.4)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [duration, isPlaying, liveTimeGetter, baseCurrentTime, size.width, size.height]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${compact ? "h-[120px]" : "h-[320px]"} select-none`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 rounded-lg bg-slate-950 cursor-pointer"
        onMouseDown={(event) => {
          if (!duration) return;
          dragging.current = true;
          dragStartX.current = event.clientX;
          dragStartTime.current = liveTimeGetter?.() ?? baseCurrentTime;
          if (fixedCenter && zoom > 1) {
            dragPreviewTime.current = dragStartTime.current;
            event.currentTarget.style.cursor = "grabbing";
          } else {
            dragPreviewTime.current = null;
            event.currentTarget.style.cursor = "pointer";
          }
        }}
        onMouseMove={(event) => {
          if (!duration) return;
          if (dragging.current && fixedCenter && zoom > 1) {
            const rect = event.currentTarget.getBoundingClientRect();
            const deltaPx = event.clientX - (dragStartX.current ?? event.clientX);
            const { spanSec } = computeViewWindow(duration, dragStartTime.current ?? baseCurrentTime, zoom);
            const secondsPerPixel = spanSec / Math.max(rect.width, 1);
            // Invert drag direction: dragging canvas left moves playhead right (DJ-style grab)
            const nextTime = clamp((dragStartTime.current ?? baseCurrentTime) - deltaPx * secondsPerPixel, 0, duration);
            dragPreviewTime.current = nextTime;
          } else if (dragging.current) {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
            onSeek(ratio);
          }
        }}
        onMouseUp={(event) => {
          if (dragging.current && fixedCenter && zoom > 1 && dragPreviewTime.current !== null) {
            suppressNextClick.current = true;
            onSeek(dragPreviewTime.current / Math.max(duration, 0.001));
          } else if (dragging.current && !fixedCenter) {
            // finalize scrub to the release position
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
              onSeek(ratio);
            }
          }
          dragging.current = false;
          dragPreviewTime.current = null;
        }}
        onMouseLeave={() => {
          dragging.current = false;
          dragPreviewTime.current = null;
        }}
        onClick={(event) => {
          if (suppressNextClick.current) {
            suppressNextClick.current = false;
            return;
          }
          if (!duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
          if (fixedCenter && zoom > 1) {
            const { startSec, spanSec } = computeViewWindow(duration, baseCurrentTime, zoom);
            const nextTime = startSec + ratio * spanSec;
            onSeek(nextTime / Math.max(duration, 0.001));
          } else {
            onSeek(ratio);
          }
        }}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 rounded-lg" />
    </div>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildR2SourceFromCatalog(record?: CatalogRecord): TrackSource | null {
  if (!record || !record.path) return null;
  const label = record.name ?? record.path;
  const path = record.path;
  const url = buildApiUrl(`/api/tracks/${encodeURIComponent(path)}`);
  return {
    label,
    url,
    originalName: path,
    bpm: record.bpm ?? null,
    fetchArrayBuffer: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`audio request failed (${response.status})`);
      return response.arrayBuffer();
    },
  };
}

// Compute the currently visible time window given zoom and a center time.
function computeViewWindow(duration: number, centerTime: number, zoom: number) {
  const safeDuration = Math.max(duration, 0.001);
  const spanSec = Math.min(safeDuration, safeDuration / Math.max(zoom, 0.1));
  const half = spanSec / 2;
  let startSec = centerTime - half;
  let endSec = centerTime + half;
  // Allow the window to extend past edges; sampling clamps time to valid range to keep playhead centered visually.
  if (spanSec >= safeDuration) {
    startSec = 0;
    endSec = safeDuration;
  }
  return { startSec, endSec, spanSec };
}

// Clamp utility kept local for computeViewWindow and scrolling math
function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Ask the Cloudflare Worker + analyzer container to compute a waveform for a track
 * that lives in R2. Returns null if unavailable or the request fails.
 */
type AnalyzeResponse = { waveform: WaveformData; bpm?: number | null; beatOffsetSeconds?: number | null };

async function analyzeWithWorker(source: TrackSource): Promise<AnalyzeResponse | null> {
  const apiUrl = `${buildApiUrl("/api/analyze")}`;

  // The worker expects either a trackId or path that matches the R2 object key.
  const trackId = source.originalName ?? extractFileName(source.url);
  if (!trackId) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: trackId }),
    });

    if (!response.ok) {
      console.warn("worker analyze failed", response.status);
      return null;
    }

    const payload = (await response.json()) as { waveform?: WaveformData; bpm?: number | null };
    if (payload?.waveform && Array.isArray(payload.waveform.bars)) {
      return { waveform: payload.waveform, bpm: payload.bpm ?? null };
    }
  } catch (error) {
    console.warn("worker analyze threw", error);
  }
  return null;
}

function extractFileName(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.href);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

export default WaveformPreview;
