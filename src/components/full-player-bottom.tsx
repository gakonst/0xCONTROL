import { Loader2, Pause, Play, SkipBack, SkipForward, Rewind, FastForward } from "lucide-react";

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

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-5 sm:pb-4">
      <div className="flex h-[86px] w-full max-w-3xl items-center justify-center gap-2 rounded-2xl bg-black/78 px-3 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:h-[90px] sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={() => jumpByBar(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Jump back one bar"
        >
          <Rewind className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onSkipPrevious}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Previous track"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={isBuffering}
          className="flex h-12 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_14px_40px_rgba(0,0,0,0.65)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-black/60 sm:h-[56px] sm:w-[64px]"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isBuffering ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={onSkipNext}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Next track"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => jumpByBar(1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Jump forward one bar"
        >
          <FastForward className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
