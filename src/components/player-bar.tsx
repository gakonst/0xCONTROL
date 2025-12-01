import { type MouseEvent, type PointerEvent, useRef } from "react";

import { Loader2, Pause, Play } from "lucide-react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";
import { OverviewCanvas } from "@/components/waveform-canvas";
import type { WaveformData } from "@/lib/waveform";
import { PlaybackSurface } from "@/components/playback-surface";

type PlayerBarProps = {
  track: Track;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
  bpmOverride?: number | null;
  waveform?: WaveformData | null;
  beatOffsetSeconds?: number | null;
  liveTimeGetter?: () => number;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  className?: string;
  onOpenFullScreen?: () => void;
  variant?: "standard" | "bare";
};

function PlayerBarComponent({
  track,
  isPlaying,
  isBuffering,
  elapsedSeconds,
  durationSeconds,
  bpmOverride,
  waveform,
  beatOffsetSeconds,
  liveTimeGetter,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  className,
  onOpenFullScreen,
  variant = "standard",
}: PlayerBarProps) {
  const safeDuration = durationSeconds ?? waveform?.durationSeconds ?? 0;
  const progress =
    safeDuration > 0 ? Math.min(elapsedSeconds / safeDuration, 1) : 0;
  const displayBpm =
    bpmOverride !== null && bpmOverride !== undefined
      ? Math.round(bpmOverride)
      : track.bpm;
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const swipePointerRef = useRef<number | null>(null);
  const swipeConsumedRef = useRef(false);
  const gestureLockRef = useRef<"horizontal" | "vertical" | null>(null);
  const hasExceededTapSlopRef = useRef(false);
  const ignoreOpenRef = useRef(false);

  const TAP_SLOP_PX = 8;
  const SWIPE_TRIGGER_PX = 64;

  const resetSwipe = () => {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    swipePointerRef.current = null;
    swipeConsumedRef.current = false;
    gestureLockRef.current = null;
    hasExceededTapSlopRef.current = false;
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

    swipeStartXRef.current = event.clientX;
    swipeStartYRef.current = event.clientY;
    swipePointerRef.current = event.pointerId;
    swipeConsumedRef.current = false;
    gestureLockRef.current = null;
    hasExceededTapSlopRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetSwipe();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      swipePointerRef.current === null ||
      event.pointerId !== swipePointerRef.current ||
      swipeStartXRef.current === null ||
      swipeStartYRef.current === null
    ) {
      return;
    }

    const deltaX = event.clientX - swipeStartXRef.current;
    const deltaY = event.clientY - swipeStartYRef.current;

    if (
      !hasExceededTapSlopRef.current &&
      (Math.abs(deltaX) > TAP_SLOP_PX || Math.abs(deltaY) > TAP_SLOP_PX)
    ) {
      hasExceededTapSlopRef.current = true;
    }

    if (!gestureLockRef.current && hasExceededTapSlopRef.current) {
      gestureLockRef.current =
        Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";

      // Let vertical scroll behave normally once we know it's not a swipe.
      if (
        gestureLockRef.current === "vertical" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }

    if (
      gestureLockRef.current === "horizontal" &&
      !swipeConsumedRef.current &&
      Math.abs(deltaX) >= SWIPE_TRIGGER_PX
    ) {
      if (deltaX > 0) {
        onSkipPrevious();
      } else {
        onSkipNext();
      }
      swipeConsumedRef.current = true;
    }
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
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;

    const deltaX = event.clientX - swipeStartXRef.current;
    const deltaY = event.clientY - swipeStartYRef.current;
    const locked = gestureLockRef.current;

    if (!swipeConsumedRef.current && locked === "horizontal") {
      if (Math.abs(deltaX) >= SWIPE_TRIGGER_PX) {
        if (deltaX > 0) {
          onSkipPrevious();
        } else {
          onSkipNext();
        }
        swipeConsumedRef.current = true;
      }
    }

    const actedOnSwipe = swipeConsumedRef.current;
    const consideredTap = !hasExceededTapSlopRef.current && !actedOnSwipe;

    resetSwipe();

    if (consideredTap && !ignoreOpenRef.current) {
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
      <PlaybackSurface
        progress={progress}
        background={variant === "standard" ? "solid" : "transparent"}
        className={variant === "standard" ? undefined : "bg-transparent shadow-none"}
        paddingClassName={variant === "standard" ? "px-4 pt-3 pb-3" : "px-0 py-0"}
        contentClassName="items-center gap-3"
        overlay={
          waveform ? (
            <div className="pointer-events-none absolute inset-0 z-0 opacity-80">
              <OverviewCanvas
                waveform={waveform}
                duration={safeDuration}
                bpm={displayBpm}
                isPlaying={isPlaying}
                baseCurrentTime={elapsedSeconds}
                liveTimeGetter={liveTimeGetter}
                beatOffsetSeconds={beatOffsetSeconds ?? null}
                onSeek={() => {}}
                height={64}
                className="absolute inset-0"
                rounded={false}
                showPlayhead
              />
              <div className="absolute inset-0 z-0 bg-black/80" />
            </div>
          ) : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="min-w-0 flex-1 pb-0.5">
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
      </PlaybackSurface>
    </footer>
  );
}

export const PlayerBar = PlayerBarComponent;
