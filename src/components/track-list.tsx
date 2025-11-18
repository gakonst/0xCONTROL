import { useMemo, useState } from "react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";
import { WaveformVisualizer } from "@/components/waveform-visualizer";

type TrackListProps = {
  tracks: Track[];
  activeTrackId: string;
  onSelect: (track: Track) => void;
  className?: string;
  activeProgress?: number;
};

const formatTotalDuration = (tracks: Track[]) => {
  const totalSeconds = tracks.reduce((sum, track) => {
    const [minutes, seconds] = track.duration.split(":").map(Number);
    return sum + minutes * 60 + seconds;
  }, 0);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  if (hours === 0 && seconds > 0)
    parts.push(`${seconds.toString().padStart(2, "0")}s`);

  return parts.join(" ");
};

export function TrackList({
  tracks,
  activeTrackId,
  onSelect,
  className,
  activeProgress = 0,
}: TrackListProps) {
  const [sortField, setSortField] = useState<"title" | "bpm" | "key" | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const totalDurationLabel = formatTotalDuration(tracks);
  const sortedTracks = useMemo(() => {
    if (!sortField) return tracks;

    const compare = (a: Track, b: Track) => {
      switch (sortField) {
        case "title":
          return a.title.localeCompare(b.title);
        case "bpm":
          return a.bpm - b.bpm;
        case "key":
          return a.key.localeCompare(b.key);
        default:
          return 0;
      }
    };

    return [...tracks].sort((a, b) => {
      const comparison = compare(a, b);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [tracks, sortField, sortDirection]);

  const handleSortSelection = (field: "title" | "bpm" | "key") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const handleReset = () => {
    setSortField(null);
    setSortDirection("asc");
  };

  const sortOptions = [
    { label: "A-Z", value: "title" as const },
    { label: "BPM", value: "bpm" as const },
    { label: "Key", value: "key" as const },
  ];

  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_rgba(3,7,18,0.95))] shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur",
        className,
      )}
    >
      <header className="px-5 py-4 md:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold uppercase tracking-[0.12rem] text-foreground md:text-lg">
            Control Room
          </h1>
          <p className="text-[0.55rem] uppercase tracking-[0.08rem] text-muted-foreground/80">
            {tracks.length} tracks • {totalDurationLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-muted-foreground/90 md:text-[0.65rem]">
            <div className="flex flex-wrap gap-1">
              {sortOptions.map((option) => {
                const isActive = sortField === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSortSelection(option.value)}
                    className={cn(
                      "border border-white/30 px-2 py-1 text-[0.6rem] uppercase tracking-tight text-foreground transition md:text-[0.65rem]",
                      "rounded-none",
                      isActive
                        ? "bg-white/10"
                        : "bg-transparent hover:bg-white/5",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {option.label}
                      <span
                        className={cn(
                          "inline-flex w-4 justify-center text-[0.7rem] text-muted-foreground/80 transition-opacity md:text-[0.8rem]",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      >
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[0.55rem] tracking-tight text-foreground/80 underline-offset-4 transition hover:text-foreground hover:underline md:text-[0.6rem]"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto pb-6">
        {sortedTracks.map((track) => {
          const isActive = activeTrackId === track.id;

          return (
            <button
              key={track.id}
              type="button"
              onClick={() => onSelect(track)}
              className={cn(
                "group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
                "min-h-[3.5rem]",
                isActive ? "bg-white/5" : "hover:bg-white/5/40",
              )}
            >
              <div className="flex items-center gap-2 text-xs font-medium tracking-tight text-muted-foreground">
                <div className="h-10 w-16 flex-shrink-0">
                  <WaveformVisualizer
                    trackId={track.id}
                    progress={isActive ? activeProgress : 0}
                    variant="thumbnail"
                    className="h-full w-full rounded-lg"
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="truncate text-[0.9rem] font-semibold text-foreground md:text-base">
                  {track.title}
                </p>
                <p className="truncate text-[0.65rem] text-muted-foreground md:text-xs">
                  {track.artist}
                </p>
              </div>

              <div className="ml-auto flex w-[110px] flex-shrink-0 flex-col items-end text-right md:w-[120px]">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
                  {track.bpm} BPM
                </span>
                <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted-foreground md:text-sm">
                  <span className="inline-flex w-8 justify-center rounded-none border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-tight text-black/80 md:text-xs">
                    {track.key}
                  </span>
                  <span className="text-[0.7rem] md:text-xs">
                    {track.duration}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
