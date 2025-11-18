import { type MouseEvent, type PointerEvent, useMemo, useRef } from "react";

import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { Track } from "@/data/tracks";
import { WaveformVisualizer } from "@/components/waveform-visualizer";

type FullScreenPlayerProps = {
  track: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
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
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onClose,
  onSeek,
}: FullScreenPlayerProps) {
  const parseDurationToSeconds = (duration?: string) => {
    if (!duration) return 0;
    const parts = duration.split(":").map((value) => Number(value) || 0);
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return minutes * 60 + seconds;
    }
    return 0;
  };

  const safeDuration =
    durationSeconds ?? parseDurationToSeconds(track.duration);
  const progress =
    safeDuration > 0 ? Math.min(elapsedSeconds / safeDuration, 1) : 0;

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
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const resetSwipe = () => {
    swipeStartRef.current = null;
    swipePointerRef.current = null;
  };

  const handleSeekClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || safeDuration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    onSeek(ratio * safeDuration);
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-black via-[#100b1b] to-[#010308] text-white">
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
        className="flex w-full justify-center px-4 pt-4"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="h-1.5 w-16 rounded-full bg-white/40" />
      </div>

      <header className="flex items-center justify-between px-4 pt-6 text-xs uppercase tracking-[0.2rem] text-white/70">
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

      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-8 text-center">
        <div className="relative flex h-64 w-64 items-center justify-center md:h-80 md:w-80">
          <WaveformVisualizer
            trackId={track.id}
            progress={progress}
            variant="full"
            className="h-full w-full rounded-2xl border border-white/30 bg-black/20 shadow-[0_25px_80px_rgba(0,0,0,0.65)]"
          />
        </div>

        <div className="w-full max-w-xl">
          <p className="truncate text-2xl font-semibold">{track.title}</p>
          <p className="mt-1 truncate text-base text-white/70">
            {track.artist}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2rem] text-white/60">
            {track.bpm} BPM • {track.key}
          </p>
        </div>

        <div className="w-full max-w-xl">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span>{formatTime(elapsedSeconds)}</span>
            <span>{formatTime(safeDuration)}</span>
          </div>
          <div
            ref={progressBarRef}
            className="mt-2 h-1.5 w-full cursor-pointer overflow-hidden rounded bg-white/20"
            onClick={handleSeekClick}
          >
            <div
              className="h-full bg-white"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6">
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
  );
}
