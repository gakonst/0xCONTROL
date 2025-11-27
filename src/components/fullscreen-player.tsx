import { type PointerEvent, useMemo, useRef, useState } from "react";

import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Minus,
  Plus,
} from "lucide-react";

import { DetailCanvas, OverviewCanvas } from "@/components/waveform-canvas";
import { Track } from "@/data/tracks";
import { parseDurationToSeconds } from "@/lib/time";
import type { WaveformData } from "@/lib/waveform";

type FullScreenPlayerProps = {
  track: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
  waveform?: WaveformData | null;
  waveformBpm?: number | null;
  beatOffsetSeconds?: number | null;
  liveTimeGetter?: () => number;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onClose: () => void;
  onSeek: (seconds: number) => void;
};

export function FullScreenPlayer({
  track,
  isPlaying,
  isBuffering,
  elapsedSeconds,
  durationSeconds,
  waveform,
  waveformBpm,
  beatOffsetSeconds,
  liveTimeGetter,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onClose,
  onSeek,
}: FullScreenPlayerProps) {
  const [detailZoom, setDetailZoom] = useState(8);
  const safeDuration =
    durationSeconds ??
    waveform?.durationSeconds ??
    parseDurationToSeconds(track.duration);
  const displayBpm =
    waveformBpm !== null && waveformBpm !== undefined
      ? Math.round(waveformBpm)
      : track.bpm;

  const formatTime = useMemo(
    () => (value: number) => {
      const clamped = Math.max(0, Math.floor(value));
      const minutes = Math.floor(clamped / 60);
      const seconds = clamped % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    },
    [],
  );

  const swipeStartRef = useRef<number | null>(null);
  const swipePointerRef = useRef<number | null>(null);

  const resetSwipe = () => {
    swipeStartRef.current = null;
    swipePointerRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = event.clientY;
    swipePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetSwipe();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (
      swipePointerRef.current !== null &&
      event.pointerId !== swipePointerRef.current
    ) {
      return;
    }
    if (swipeStartRef.current === null) return;

    const deltaY = event.clientY - swipeStartRef.current;
    const threshold = 80;
    if (deltaY >= threshold) {
      onClose();
    }
    resetSwipe();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-black via-[#100b1b] to-[#010308] text-white">
      <div className="absolute inset-0 -z-10 opacity-40">
        {track.cover ? (
          <img
            src={track.cover}
            alt={track.title}
            className="h-full w-full object-cover blur-3xl"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-black to-[#010308]" />
        )}
      </div>

      <div
        className="sticky top-0 flex w-full justify-center px-4 pt-3"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="h-1.5 w-16 rounded-full bg-white/40" />
      </div>

      <header className="flex items-center justify-between px-4 pb-3 text-xs uppercase tracking-[0.2rem] text-white/70">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/40"
          aria-label="Close player"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <span>Now Playing</span>
        <div className="h-10 w-10" />
      </header>

      <div className="flex flex-col gap-6 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+170px)] pt-4 text-center md:pb-[140px]">
        <div className="w-full max-w-4xl self-center overflow-hidden rounded-2xl border border-white/20 bg-black/25 shadow-[0_25px_80px_rgba(0,0,0,0.65)] backdrop-blur px-2 py-3 md:px-3">
          {waveform ? (
            <DetailCanvas
              waveform={waveform}
              duration={safeDuration}
              bpm={waveformBpm ?? track.bpm}
              beatOffsetSeconds={beatOffsetSeconds}
              zoom={detailZoom}
              isPlaying={isPlaying}
              baseCurrentTime={elapsedSeconds}
              liveTimeGetter={liveTimeGetter}
              onSeek={(ratio) => onSeek(ratio * safeDuration)}
              height={220}
              className="relative h-[220px] w-full md:h-[260px]"
            />
          ) : (
            <div className="flex h-[260px] w-full items-center justify-center bg-gradient-to-b from-white/5 to-white/0">
              {track.cover ? (
                <img
                  src={track.cover}
                  alt={track.title}
                  className="h-36 w-36 rounded-xl object-cover shadow-2xl md:h-44 md:w-44"
                />
              ) : (
                <span className="text-4xl font-semibold uppercase text-white/60 md:text-5xl">
                  {track.title.charAt(0).toUpperCase() ||
                    track.artist.charAt(0).toUpperCase() ||
                    "?"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="w-full max-w-xl self-center">
          <p className="truncate text-2xl font-semibold md:text-3xl">{track.title}</p>
          <p className="mt-1 truncate text-base text-white/80 md:text-lg">
            {track.artist}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2rem] text-white/60">
            {displayBpm} BPM • {track.key}
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/75 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 backdrop-blur-xl shadow-[0_-18px_48px_rgba(0,0,0,0.45)]">
        <div className="mx-auto w-full max-w-4xl space-y-3">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span>{formatTime(elapsedSeconds)}</span>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">
              <button
                type="button"
                onClick={() =>
                  setDetailZoom((z: number) => Math.max(1, +(z - 1).toFixed(1)))
                }
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/10 transition hover:bg-white/20"
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[52px] text-center text-white">{detailZoom.toFixed(1)}×</span>
              <button
                type="button"
                onClick={() =>
                  setDetailZoom((z: number) => Math.min(32, +(z + 1).toFixed(1)))
                }
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/10 transition hover:bg-white/20"
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span>{formatTime(safeDuration)}</span>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/40 p-2">
            {waveform ? (
              <OverviewCanvas
                waveform={waveform}
                duration={safeDuration}
                bpm={waveformBpm ?? track.bpm}
                beatOffsetSeconds={beatOffsetSeconds}
                isPlaying={isPlaying}
                baseCurrentTime={elapsedSeconds}
                liveTimeGetter={liveTimeGetter}
                onSeek={(ratio) => onSeek(ratio * safeDuration)}
                height={80}
                className="relative h-[80px] w-full md:h-[96px]"
              />
            ) : (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-white/20">
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${
                      safeDuration > 0
                        ? Math.min((elapsedSeconds / safeDuration) * 100, 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 pt-1">
            <button
              type="button"
              onClick={onSkipPrevious}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/10"
              aria-label="Previous track"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isBuffering}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-black/60"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isBuffering ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </button>
            <button
              type="button"
              onClick={onSkipNext}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/10"
              aria-label="Next track"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
