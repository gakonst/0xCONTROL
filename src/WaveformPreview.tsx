import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { OverviewCanvas, DetailCanvas } from "@/components/waveform-canvas";
import { buildApiUrl } from "@/lib/api";
import { clamp } from "@/lib/math";
import { type WaveformData } from "@/lib/waveform";
import { fetchWaveformAnalysis } from "@/lib/waveform-client";
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
        const analyzed = await fetchWaveformAnalysis(
          source.originalName ?? source.label,
        );
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
    <div className="min-h-screen w-full bg-background text-white">
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
              <Pill subtle>{bpm ? `${Math.round(bpm)} BPM` : "BPM analyzing"}</Pill>
            </div>
          </div>

          <div className="space-y-4">
            {/* Overview pane */}
            <PaneLabel>Overview</PaneLabel>
            <OverviewCanvas
              waveform={waveform}
              duration={duration}
              bpm={bpm ?? selectedTrack?.bpm ?? null}
              beatOffsetSeconds={beatOffsetSeconds}
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
            <DetailCanvas
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

export default WaveformPreview;
