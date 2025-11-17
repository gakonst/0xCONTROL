import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";

import { Track } from "@/data/tracks";

type PlayerBarProps = {
  track: Track;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
};

const toSeconds = (value: string) => {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
};

const formatTime = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = Math.max(0, Math.round(value % 60));
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export function PlayerBar({
  track,
  isPlaying,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
}: PlayerBarProps) {
  const durationInSeconds = toSeconds(track.duration);
  const idValue = track.id
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const progress = ((idValue % 45) + 20) / 100;
  const elapsedSeconds = Math.round(durationInSeconds * progress);

  return (
    <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 md:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:w-[260px] sm:flex-none sm:gap-4 md:w-[320px]">
          <img
            src={track.cover}
            alt={track.title}
            className="h-14 w-14 flex-none rounded-2xl border border-white/10 object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {track.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {track.artist}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-3">
          <div className="flex items-center gap-4 text-muted-foreground">
            <button
              type="button"
              className="rounded-full border border-white/10 p-2 transition hover:border-white/30 hover:text-foreground"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSkipPrevious}
              className="rounded-full border border-white/10 p-2 transition hover:border-white/30 hover:text-foreground"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-white/30 transition hover:bg-white/90"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onSkipNext}
              className="rounded-full border border-white/10 p-2 transition hover:border-white/30 hover:text-foreground"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 p-2 transition hover:border-white/30 hover:text-foreground"
            >
              <Repeat className="h-4 w-4" />
            </button>
          </div>

          <div className="flex w-full items-center gap-3 text-[0.7rem] text-muted-foreground">
            <span className="tabular-nums">{formatTime(elapsedSeconds)}</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 left-0 bg-white"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="tabular-nums text-foreground/80">
              {track.duration}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-muted-foreground">
          <button
            type="button"
            className="rounded-full border border-white/10 p-2 transition hover:border-white/30 hover:text-foreground"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
            <span className="block h-full w-2/3 bg-white" />
          </div>
        </div>
      </div>
    </footer>
  );
}
