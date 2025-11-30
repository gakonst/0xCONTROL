import { type PointerEvent, useMemo, useRef } from "react";

import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
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
  const detailZoom = 16;
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
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gradient-to-b from-black via-[#100b1b] to-[#010308] text-white">
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

      <div className="flex w-full flex-1 flex-col items-center gap-3 px-3 pb-14 pt-5 text-center sm:gap-4 md:gap-5 md:px-5">
        <div className="w-full max-w-4xl overflow-hidden rounded-none border border-white/20 bg-black/25 shadow-[0_25px_80px_rgba(0,0,0,0.65)] backdrop-blur px-2 py-3 md:px-3">
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
              height={150}
              className="relative h-[150px] w-full sm:h-[180px] md:h-[220px]"
              rounded={false}
            />
          ) : (
            <div className="flex h-[280px] w-full items-center justify-center bg-gradient-to-b from-white/5 to-white/0">
              {track.cover ? (
                <img
                  src={track.cover}
                  alt={track.title}
                  className="h-40 w-40 rounded-xl object-cover shadow-2xl"
                />
              ) : (
                <span className="text-5xl font-semibold uppercase text-white/60">
                  {track.title.charAt(0).toUpperCase() ||
                    track.artist.charAt(0).toUpperCase() ||
                    "?"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="w-full max-w-xl">
          <p className="truncate text-2xl font-semibold">{track.title}</p>
          <p className="mt-1 truncate text-base text-white/70">
            {track.artist}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2rem] text-white/60">
            {displayBpm} BPM • {track.key}
          </p>
        </div>

        <div className="w-full max-w-4xl space-y-2">
          <div className="flex items-center justify-between text-[11px] text-white/70 sm:text-xs">
            <span>{formatTime(elapsedSeconds)}</span>
            <span>{formatTime(safeDuration)}</span>
          </div>
          <div className="rounded-none border border-white/15 bg-black/30 p-1.5 sm:p-2">
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
                height={48}
                className="relative h-[48px] w-full rounded-none sm:h-[60px] md:h-[82px]"
                rounded={false}
              />
            ) : (
              <div className="mt-1 h-[2px] w-full overflow-hidden rounded-none bg-white/20 sm:h-1">
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
        </div>

        <div className="sticky inset-x-0 bottom-3 z-10 mt-3 flex w-full max-w-none items-center justify-center gap-2 rounded-none border border-white/25 bg-black/80 px-3 py-2 backdrop-blur sm:bottom-4 sm:gap-3 sm:px-4 mx-[-12px] sm:mx-[-16px] md:mx-[-20px]">
          <button
            type="button"
            onClick={onSkipPrevious}
            className="flex h-10 w-12 items-center justify-center rounded-none border border-white/40 bg-white/10 sm:h-11 sm:w-12"
            aria-label="Previous track"
          >
            <SkipBack className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={isBuffering}
            className="flex h-12 w-14 items-center justify-center rounded-none bg-white text-black shadow-lg transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-black/60 sm:h-[56px] sm:w-[60px]"
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
            className="flex h-10 w-12 items-center justify-center rounded-none border border-white/40 bg-white/10 sm:h-11 sm:w-12"
            aria-label="Next track"
          >
            <SkipForward className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
