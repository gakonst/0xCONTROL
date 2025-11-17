import { useMemo, useState } from "react";

import type { Track } from "@/data/tracks";
import type { Playlist } from "@/types/playlists";
import { cn } from "@/lib/utils";
import { LibraryHeader } from "@/components/library-header";

export type PlaylistSortField = "title" | "createdAt" | "updatedAt";
export type PlaylistSortDirection = "asc" | "desc";

type PlaylistBrowserProps = {
  playlists: Playlist[];
  tracks: Track[];
  onSelect: (playlistId: string) => void;
  sortField: PlaylistSortField;
  sortDirection: PlaylistSortDirection;
  onSortChange: (field: PlaylistSortField, direction: PlaylistSortDirection) => void;
  onSortReset: () => void;
};

export function PlaylistBrowser({
  playlists,
  tracks,
  onSelect,
  sortField,
  sortDirection,
  onSortChange,
  onSortReset,
}: PlaylistBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const trackMap = useMemo(() => {
    return new Map(tracks.map((track) => [track.id, track]));
  }, [tracks]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery.trim()) {
      return playlists;
    }

    const terms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return playlists.filter((playlist) => {
      const haystack = [
        playlist.title,
        playlist.description,
        playlist.mood,
        ...(playlist.tags ?? []),
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

      return terms.every((term) =>
        haystack.some((value) => value.includes(term)),
      );
    });
  }, [playlists, searchQuery]);

  const sortedPlaylists = useMemo(() => {
    const compare = (a: Playlist, b: Playlist) => {
      switch (sortField) {
        case "createdAt":
        case "updatedAt": {
          const aTime = new Date(a[sortField]).getTime();
          const bTime = new Date(b[sortField]).getTime();
          return aTime - bTime;
        }
        case "title":
        default:
          return a.title.localeCompare(b.title);
      }
    };

    const result = [...filteredPlaylists].sort(compare);
    return sortDirection === "asc" ? result : result.reverse();
  }, [filteredPlaylists, sortField, sortDirection]);

  const sortOptions: Array<{
    label: string;
    value: "title" | "createdAt" | "updatedAt";
  }> = [
    { label: "A-Z", value: "title" },
    { label: "Created", value: "createdAt" },
    { label: "Modified", value: "updatedAt" },
  ];

  const handleSortSelection = (value: PlaylistSortField) => {
    if (sortField === value) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      onSortChange(value, nextDirection);
      return;
    }
    const defaultDirection = value === "title" ? "asc" : "desc";
    onSortChange(value, defaultDirection);
  };

  const handleResetSort = () => {
    onSortReset();
  };

  if (!playlists.length) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-white/10 bg-black/30 text-center text-sm text-muted-foreground">
        <p>No playlists yet.</p>
        <p className="text-xs text-white/60">
          Use the Create tab below to start drafting one.
        </p>
      </section>
    );
  }

  const aggregateTrackCount = filteredPlaylists.reduce(
    (total, playlist) => total + playlist.trackIds.length,
    0,
  );

  const statsParts = [
    `${filteredPlaylists.length} playlists`,
    filteredPlaylists.length !== playlists.length
      ? `filtered from ${playlists.length}`
      : null,
    `${aggregateTrackCount} tracks total`,
  ]
    .filter(Boolean)
    .join(" • ");

  const extraControls = (
    <div className="grid grid-cols-4 gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-muted-foreground/90 md:text-[0.65rem]">
      {sortOptions.map((option) => {
        const isActive = sortField === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSortSelection(option.value)}
            className={cn(
              "border border-white/30 px-2 py-1 text-[0.6rem] uppercase tracking-tight text-foreground transition md:text-[0.65rem]",
              "rounded-none w-full leading-tight text-center",
              isActive ? "bg-white/10" : "bg-transparent hover:bg-white/5",
            )}
          >
            <span className="relative flex w-full items-center justify-center">
              <span className="w-full text-center">{option.label}</span>
              <span
                className={cn(
                  "absolute right-1 top-1/2 -translate-y-1/2 text-[0.7rem] text-muted-foreground/80 transition-opacity md:right-1.5 md:text-[0.8rem]",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              >
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={handleResetSort}
        className="border border-white/30 px-2 py-1 text-[0.6rem] uppercase tracking-tight text-foreground transition hover:bg-white/5 md:text-[0.65rem] text-center"
      >
        Reset
      </button>
    </div>
  );

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_rgba(3,7,18,0.95))] shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur">
      <LibraryHeader
        title="Playlists"
        stats={statsParts}
        search={{
          id: "playlist-search",
          value: searchQuery,
          placeholder: 'Search playlists or tags',
          label: "Search playlists",
          onChange: setSearchQuery,
        }}
        onClearSearch={() => setSearchQuery("")}
        extraControls={extraControls}
      />
      <div className="flex-1 overflow-auto pb-6">
        {sortedPlaylists.map((playlist) => {
          const playlistTracks = playlist.trackIds
            .map((trackId) => trackMap.get(trackId))
            .filter(Boolean) as Track[];
          const durationLabel = formatTotalDuration(playlistTracks);
          const fallbackInitial =
            playlist.title.charAt(0).toUpperCase() ||
            playlist.mood.charAt(0).toUpperCase() ||
            "?";

          return (
            <button
              key={playlist.id}
              type="button"
              onClick={() => onSelect(playlist.id)}
              className={cn(
                "group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
                "min-h-[3.5rem] hover:bg-white/5/40",
              )}
            >
              <div className="flex items-center gap-2 text-xs font-medium tracking-tight text-muted-foreground">
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden border border-white/10 bg-white/5">
                  {playlist.accentFrom && playlist.accentTo ? (
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${playlist.accentFrom}, ${playlist.accentTo})`,
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold uppercase text-white/70">
                      {fallbackInitial}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="truncate text-[0.9rem] font-semibold text-foreground md:text-base">
                  {playlist.title}
                </p>
                <p className="truncate text-[0.65rem] text-muted-foreground md:text-xs">
                  {playlist.mood}
                </p>
              </div>

              <div className="ml-auto flex w-[120px] flex-shrink-0 flex-col items-end text-right md:w-[130px]">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
                  {playlistTracks.length} tracks
                </span>
                <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted-foreground md:text-sm">
                  <span className="inline-flex min-w-[3.5rem] justify-center rounded-none border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-tight text-black/80 md:text-xs">
                    {durationLabel || "0m"}
                  </span>
                  <span className="text-[0.7rem] md:text-xs">
                    {formatRelativeDate(playlist.updatedAt)}
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

function formatTotalDuration(tracks: Track[]): string {
  if (!tracks.length) return "";
  const totalSeconds = tracks.reduce((total, track) => {
    const [minutes = 0, seconds = 0] = track.duration
      .split(":")
      .map((value) => Number(value));
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return total;
    }
    return total + minutes * 60 + seconds;
  }, 0);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
