import { type MouseEvent, type PointerEvent, useRef } from "react";

import { Loader2, Pause, Play } from "lucide-react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";
import { OverviewCanvas } from "@/components/waveform-canvas";
import type { WaveformData } from "@/lib/waveform";

type PlayerBarProps = {
  track: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
  bpmOverride?: number | null;
  waveform?: WaveformData | null;
  liveTimeGetter?: () => number;
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
  waveform,
  liveTimeGetter,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  className,
  onOpenFullScreen,
}: PlayerBarProps) {
  const safeDuration = durationSeconds ?? waveform?.durationSeconds ?? 0;
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
        className="relative overflow-hidden bg-[rgba(2,2,6,0.98)] px-4 py-3 text-white shadow-[0_-15px_60px_rgba(0,0,0,0.65)]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {waveform && (
          <div className="pointer-events-none absolute inset-0 z-0 opacity-80">
            <OverviewCanvas
              waveform={waveform}
              duration={safeDuration}
              bpm={displayBpm}
              isPlaying={isPlaying}
              baseCurrentTime={elapsedSeconds}
              liveTimeGetter={liveTimeGetter}
              beatOffsetSeconds={null}
              onSeek={() => {}}
              height={64}
              className="absolute inset-0"
              rounded={false}
              showPlayhead
            />
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-black/85 via-black/70 to-black/85" />
          </div>
        )}

        <div className="relative z-20 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              {track.title}
            </p>
            <p className="truncate text-xs text-white/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
              {track.artist}
            </p>
          </div>
          <div className="flex flex-col items-end text-right text-[0.65rem] uppercase tracking-[0.1rem] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            <span className="text-sm font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
              {displayBpm} BPM
            </span>
            <span className="mt-1 inline-flex min-w-[3rem] justify-center border border-white/70 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,1)]">
              {track.key}
            </span>
          </div>
          <button
            type="button"
            onClick={handlePlayClick}
            disabled={isBuffering}
            data-player-play-control="play"
            className="relative z-30 flex h-12 w-12 flex-none items-center justify-center bg-white text-black shadow-[0_12px_32px_rgba(0,0,0,0.65)] ring-2 ring-white transition hover:bg-white/90 hover:shadow-[0_14px_40px_rgba(0,0,0,0.7)] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:bg-white/70 disabled:text-black/70"
          >
            {isBuffering ? (
              <Loader2 className="h-5 w-5 animate-spin drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />
            ) : (
              <Play className="h-5 w-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />
            )}
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 h-1 bg-white/20">
          <span
            className="block h-full bg-white"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="pointer-events-none absolute inset-0 z-5 bg-gradient-to-r from-white/0 via-white/0 to-white/10" />
      </div>
    </footer>
  );
}
