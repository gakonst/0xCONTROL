import { type MouseEvent, type PointerEvent, useRef } from "react";

import { Loader2, Pause, Play } from "lucide-react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";

type PlayerBarProps = {
  track: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
  bpmOverride?: number | null;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  className?: string;
  onOpenFullScreen?: () => void;
};

export function PlayerBar({
  track,
  isPlaying,
  isBuffering,
  elapsedSeconds,
  durationSeconds,
  bpmOverride,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  className,
  onOpenFullScreen,
}: PlayerBarProps) {
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
  const displayBpm =
    bpmOverride !== null && bpmOverride !== undefined
      ? Math.round(bpmOverride)
      : track.bpm;
  const swipeStartRef = useRef<number | null>(null);
  const swipePointerRef = useRef<number | null>(null);
  const ignoreOpenRef = useRef(false);

  const resetSwipe = () => {
    swipeStartRef.current = null;
    swipePointerRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const interactedWithPlayControl = Boolean(
      target?.closest("[data-player-play-control='play']"),
    );
    ignoreOpenRef.current = interactedWithPlayControl;

    if (interactedWithPlayControl) {
      resetSwipe();
      return;
    }

    swipeStartRef.current = event.clientX;
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

    const startX = swipeStartRef.current ?? event.clientX;
    const deltaX = event.clientX - startX;
    const threshold = 60;
    let didSwipe = false;
    if (deltaX <= -threshold) {
      onSkipNext();
      didSwipe = true;
    } else if (deltaX >= threshold) {
      onSkipPrevious();
      didSwipe = true;
    }
    resetSwipe();
    if (!didSwipe && !ignoreOpenRef.current) {
      onOpenFullScreen?.();
    }
    ignoreOpenRef.current = false;
  };

  const handlePlayClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onTogglePlay();
  };

  return (
    <footer className={cn("w-full", className)}>
      <div
        className="relative bg-[rgba(18,18,18,0.98)] px-4 py-3 text-white shadow-[0_-15px_60px_rgba(0,0,0,0.55)]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden border border-white/10 bg-white/5 text-sm font-semibold uppercase text-white/70">
            {track.cover ? (
              <img
                src={track.cover}
                alt={track.title}
                className="h-full w-full object-cover"
              />
            ) : (
              track.title.charAt(0).toUpperCase() ||
              track.artist.charAt(0).toUpperCase() ||
              "?"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {track.title}
            </p>
            <p className="truncate text-xs text-white/60">{track.artist}</p>
          </div>
          <div className="flex flex-col items-end text-right text-[0.65rem] uppercase tracking-[0.1rem] text-white/60">
            <span className="text-sm font-semibold text-white">
              {displayBpm} BPM
            </span>
            <span className="mt-1 inline-flex min-w-[3rem] justify-center border border-white/40 px-2 py-0.5 text-xs font-semibold text-white">
              {track.key}
            </span>
          </div>
          <button
            type="button"
            onClick={handlePlayClick}
            disabled={isBuffering}
            data-player-play-control="play"
            className="flex h-11 w-11 flex-none items-center justify-center bg-white text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-black/60"
          >
            {isBuffering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <span
            className="block h-full bg-white"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/0 via-white/0 to-white/10" />
      </div>
    </footer>
  );
}
