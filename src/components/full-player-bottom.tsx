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
  variant?: "fixed" | "inline";
  className?: string;
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
  variant = "fixed",
  className,
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

  const inner = (
    <div
      className={
        variant === "inline"
          ? `relative flex w-full items-center justify-center gap-3 px-4 py-3 text-white sm:px-5 ${className ?? ""}`
          : `flex h-[86px] w-full max-w-3xl items-center justify-center gap-2 rounded-2xl bg-black/78 px-3 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:h-[90px] sm:gap-3 sm:px-5 ${className ?? ""}`
      }
    >
      {variant === "inline" && (
        <span className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-black/85 via-black/70 to-black/85" />
      )}
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
    </div>
  );

  if (variant === "inline") {
    return inner;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-5 sm:pb-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-black/78 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        {inner}
      </div>
    </div>
  );
}
