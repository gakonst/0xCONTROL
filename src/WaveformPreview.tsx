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

import {
  analyzeWaveformFromBuffer,
  type WaveformData,
} from "@/lib/waveform";
import { FFmpeg } from "@ffmpeg/ffmpeg/dist/esm/classes.js";

type LocalManifestEntry = {
  fileName?: string;
  name?: string;
  artist?: string;
};

type TrackSource = {
  label: string;
  url: string;
  originalName?: string;
  waveformUrl?: string;
  /** fetches the raw audio bytes to decode */
  fetchArrayBuffer: () => Promise<ArrayBuffer>;
};

const SAMPLE_MANIFEST_URL = "/tracks/manifest.json";
const FALLBACK_SAMPLE = "/tracks/Anyma, Argy, Son of Son - Voices In My Head.mp3";

export function WaveformPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>("none");
  const [sampleChoice, setSampleChoice] = useState<TrackSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadManifest = async () => {
      try {
        const response = await fetch(SAMPLE_MANIFEST_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`manifest status ${response.status}`);
        const manifest = (await response.json()) as LocalManifestEntry[];
        const first = manifest[0];
        if (cancelled) return;
        const fileName = first?.fileName ?? FALLBACK_SAMPLE.split("/").pop()!;
        const url = first?.fileName
          ? `/tracks/${encodeURIComponent(first.fileName)}`
          : FALLBACK_SAMPLE;
        setSampleChoice(
          buildRemoteSource(
            url,
            first?.name ?? "Sample Track",
            `/tracks/waveforms/${encodeURIComponent(fileName)}.json`,
          ),
        );
      } catch (error) {
        if (cancelled) return;
        // still provide a fallback sample
        setSampleChoice(
          buildRemoteSource(
            FALLBACK_SAMPLE,
            "Sample Track",
            "/tracks/waveforms/Anyma,%20Argy,%20Son%20of%20Son%20-%20Voices%20In%20My%20Head.mp3.json",
          ),
        );
        console.warn("manifest load failed", error);
      }
    };

    loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChosen = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      const source: TrackSource = {
        label: file.name,
        url: objectUrl,
        originalName: file.name,
        fetchArrayBuffer: () => file.arrayBuffer(),
      };
      await loadSource(source, true);
    },
    [],
  );

  const loadSource = useCallback(
    async (source: TrackSource, isObjectUrl = false) => {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setWaveform(null);
      setActiveSourceLabel(source.label);

      try {
        const analyzed = await loadPrecomputedWaveform(source.waveformUrl);
        if (!analyzed) {
          throw new Error(
            "No precomputed waveform found. Run `bun scripts/preprocess-waveform.ts <audio>` first.",
          );
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
        if (isObjectUrl) {
          // revoke once the audio element no longer needs it (after src is set)
          setTimeout(() => URL.revokeObjectURL(source.url), 60_000);
        }
      }
    },
    [],
  );

  const handleSampleLoad = useCallback(async () => {
    if (sampleChoice) {
      await loadSource(sampleChoice);
    }
  }, [loadSource, sampleChoice]);

  const liveTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  const formattedTime = useMemo(
    () => formatClock(currentTime) + " / " + formatClock(duration),
    [currentTime, duration],
  );

  const hasWaveform = waveform && waveform.bars.length > 0;

  return (
    <div className="min-h-screen w-full bg-[#05070f] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Waveform Lab</p>
          <h1 className="text-3xl font-semibold">Rekordbox-style RGB waveform</h1>
          <p className="max-w-3xl text-slate-300">
            Bass → red, voice → green, melody → blue, air → white. Click the waveform to seek.
            The playhead is white while playing and turns red when paused.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-xl shadow-blue-500/5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-full border border-slate-700/70 bg-slate-800/60 px-4 py-2 text-sm font-medium hover:border-slate-500">
              Upload audio
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFileChosen(file);
                }}
              />
            </label>

            <button
              type="button"
              onClick={handleSampleLoad}
              disabled={!sampleChoice || isAnalyzing}
              className="rounded-full border border-indigo-400/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 shadow-sm shadow-indigo-500/20 transition hover:border-indigo-300 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Load sample {sampleChoice ? `(${sampleChoice.label})` : ""}
            </button>

            <div className="ml-auto flex items-center gap-3 text-sm text-slate-300">
              <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                {activeSourceLabel === "none" ? "No track loaded" : activeSourceLabel}
              </span>
              {isAnalyzing && <PulseDot label="Analyzing" />}
              {!isAnalyzing && hasWaveform && <span className="text-emerald-300">Ready</span>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-xl shadow-indigo-500/5">
          <div className="mb-4 flex items-center gap-3">
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
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg shadow-slate-900/40 transition hover:-translate-y-0.5 active:translate-y-0"
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>

            <div className="flex flex-col text-sm text-slate-300">
              <span className="font-semibold text-white">{formattedTime}</span>
              <span className="text-xs text-slate-400">Click waveform to jump</span>
            </div>
          </div>

          <div className="relative rounded-xl border border-slate-800/60 bg-slate-950/80 p-3">
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
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/90 text-slate-400">
                {isAnalyzing ? "Analyzing waveform…" : "Load an audio file to inspect the waveform"}
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
            <div className="mt-3 rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              Waveform analysis failed: {analysisError}
            </div>
          )}
        </section>
      </div>
    </div>
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
  }, [waveform, size.width, size.height]);

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
    <div ref={containerRef} className="relative h-[260px] w-full">
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

function buildRemoteSource(url: string, label: string, waveformUrl?: string): TrackSource {
  return {
    label,
    url,
    waveformUrl,
    fetchArrayBuffer: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`audio request failed (${response.status})`);
      return response.arrayBuffer();
    },
  };
}

async function loadPrecomputedWaveform(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as WaveformData;
    return data;
  } catch (error) {
    console.warn("waveform fetch failed", error);
    return null;
  }
}

export default WaveformPreview;
