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
  /** fetches the raw audio bytes to decode */
  fetchArrayBuffer: () => Promise<ArrayBuffer>;
};

type CatalogRecord = {
  id?: string;
  path?: string;
  name?: string;
  artist?: string;
  durationSeconds?: number | null;
};

export function WaveformPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>("none");
  const [catalog, setCatalog] = useState<TrackSource[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackSource | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

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
        setWaveform(analyzed);
        setDuration(analyzed.durationSeconds);
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

            <div className="ml-auto flex items-center gap-2 text-xs uppercase tracking-wide text-slate-300">
              <Pill subtle>{catalog.length ? `${catalog.length} tracks` : "Loading…"}</Pill>
              <Pill subtle>{isPlaying ? "Playing" : "Paused"}</Pill>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/80 p-3 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/3 via-transparent to-transparent" aria-hidden />

            <WaveformCanvas
              waveform={waveform}
              duration={duration}
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

            {!hasWaveform && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/95 text-slate-300">
                {isAnalyzing ? "Analyzing waveform…" : catalog.length ? "Select a track to inspect the waveform" : "Loading catalog…"}
              </div>
            )}
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
  isPlaying: boolean;
  baseCurrentTime: number;
  liveTimeGetter?: () => number;
  onSeek: (ratio: number) => void;
};

function WaveformCanvas({
  waveform,
  duration,
  isPlaying,
  baseCurrentTime,
  liveTimeGetter,
  onSeek,
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState({ width: 960, height: 220 });

  // Track resize to keep canvas crisp.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.max(320, Math.floor(width)),
        height: Math.max(160, Math.floor(height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Render static waveform onto base canvas whenever data or size changes.
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
    ctx.clearRect(0, 0, size.width, size.height);

    const midY = size.height / 2;
    const bars = waveform.bars;
    const pixelsPerBar = bars.length / size.width;

    for (let x = 0; x < size.width; x += 1) {
      const barStart = Math.floor(x * pixelsPerBar);
      const barEnd = Math.min(
        bars.length,
        Math.max(barStart + 1, Math.ceil((x + 1) * pixelsPerBar)),
      );

      let amp = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let i = barStart; i < barEnd; i += 1) {
        const bar = bars[i];
        amp += bar.amplitude;
        r += bar.color.r;
        g += bar.color.g;
        b += bar.color.b;
        count += 1;
      }

      if (count === 0) continue;
      amp /= count;
      r /= count;
      g /= count;
      b /= count;

      const height = amp * (size.height * 0.48);
      const topY = midY - height;
      const barColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

      ctx.fillStyle = barColor;
      ctx.fillRect(x, topY, 1, height * 2);
    }

    // soft glow overlay
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, midY - 0.5, size.width, 1);

    // second markers to mirror original preview
    if (duration > 0) {
      const pixelsPerSecond = size.width / Math.max(duration, 0.001);
      const totalSeconds = Math.ceil(duration);
      for (let s = 0; s <= totalSeconds; s += 1) {
        const x = s * pixelsPerSecond;
        if (x > size.width) break;
        ctx.strokeStyle = s % 10 === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)";
        ctx.lineWidth = s % 10 === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, size.height);
        ctx.stroke();
      }
    }
  }, [waveform, size.width, size.height, duration]);

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
      const ratio = duration > 0 ? liveTime / duration : 0;
      const x = Math.max(0, Math.min(size.width, ratio * size.width));

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
    <div ref={containerRef} className="relative h-[320px] w-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 rounded-lg bg-slate-950"
        onClick={(event) => {
          if (!duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSeek(ratio);
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

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
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
    fetchArrayBuffer: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`audio request failed (${response.status})`);
      return response.arrayBuffer();
    },
  };
}

/**
 * Ask the Cloudflare Worker + analyzer container to compute a waveform for a track
 * that lives in R2. Returns null if unavailable or the request fails.
 */
async function analyzeWithWorker(source: TrackSource): Promise<WaveformData | null> {
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

    const payload = (await response.json()) as { waveform?: WaveformData };
    if (payload?.waveform && Array.isArray(payload.waveform.bars)) {
      return payload.waveform;
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
