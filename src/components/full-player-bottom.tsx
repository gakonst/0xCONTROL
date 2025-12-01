import { Loader2, Pause, Play, SkipBack, SkipForward, Rewind, FastForward } from "lucide-react";
import { PlaybackSurface } from "@/components/playback-surface";

type FullPlayerBottomProps = {
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds: number;
  bpm: number;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onSeek: (seconds: number) => void;
};

export function FullPlayerBottom({
  isPlaying,
  isBuffering,
  elapsedSeconds,
  durationSeconds,
  bpm,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onSeek,
}: FullPlayerBottomProps) {
  const safeDuration = Math.max(durationSeconds, 0);
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const secondsPerBar = (60 / safeBpm) * 4;

  const jumpByBar = (direction: -1 | 1) => {
    const next = Math.min(
      safeDuration,
      Math.max(0, elapsedSeconds + direction * secondsPerBar),
    );
    onSeek(next);
  };

  const progress = safeDuration > 0 ? Math.min(elapsedSeconds / safeDuration, 1) : 0;

  return (
    <PlaybackSurface
      progress={progress}
      contentClassName="items-center justify-center gap-3"
      background="transparent"
    >
      <button
        type="button"
        onClick={() => jumpByBar(-1)}
        className="relative z-10 flex h-12 w-12 items-center justify-center text-white transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label="Jump back one bar"
      >
        <Rewind className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onSkipPrevious}
        className="relative z-10 flex h-12 w-12 items-center justify-center text-white transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label="Previous track"
      >
        <SkipBack className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={isBuffering}
        className="relative z-10 flex h-12 w-12 items-center justify-center text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-2 ring-white">
          {isBuffering ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onSkipNext}
        className="relative z-10 flex h-12 w-12 items-center justify-center text-white transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label="Next track"
      >
        <SkipForward className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => jumpByBar(1)}
        className="relative z-10 flex h-12 w-12 items-center justify-center text-white transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        aria-label="Jump forward one bar"
      >
        <FastForward className="h-5 w-5" />
      </button>
    </PlaybackSurface>
  );
}
