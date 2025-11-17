import { useMemo, useState } from "react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";

type TrackListProps = {
  tracks: Track[];
  activeTrackId: string;
  onSelect: (track: Track) => void;
  className?: string;
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
}: TrackListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"title" | "bpm" | "key" | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const searchCriteria = useMemo(
    () => parseSearchQuery(searchQuery),
    [searchQuery],
  );

  const filteredTracks = useMemo(() => {
    if (!searchCriteria.hasFilters) return tracks;
    return tracks.filter((track) =>
      matchesSearchCriteria(track, searchCriteria),
    );
  }, [tracks, searchCriteria]);

  const sortedTracks = useMemo(() => {
    if (!sortField) return filteredTracks;

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

    return [...filteredTracks].sort((a, b) => {
      const comparison = compare(a, b);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredTracks, sortField, sortDirection]);

  const totalDurationLabel = formatTotalDuration(sortedTracks);
  const isFilteredView =
    searchCriteria.hasFilters || sortedTracks.length !== tracks.length;

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
    setSearchQuery("");
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
            {sortedTracks.length} tracks
            {isFilteredView ? ` • filtered from ${tracks.length}` : ""} •{" "}
            {totalDurationLabel}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <label htmlFor="track-search" className="sr-only">
                Search tracks
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="track-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder='Search titles, artists, or use filters like "bpm:>130"'
                  className="w-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none focus:ring-1 focus:ring-white/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="border border-white/40 px-3 py-2 text-[0.55rem] uppercase tracking-tight text-white transition hover:bg-white/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
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
                      "rounded-none w-full leading-tight",
                      isActive
                        ? "bg-white/10"
                        : "bg-transparent hover:bg-white/5",
                    )}
                  >
                    <span className="flex items-center justify-center gap-2">
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
              <button
                type="button"
                onClick={handleReset}
                className="border border-white/30 px-2 py-1 text-[0.6rem] uppercase tracking-tight text-foreground transition hover:bg-white/5 md:text-[0.65rem]"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto pb-6">
        {sortedTracks.map((track) => {
          const isActive = activeTrackId === track.id;
          const fallbackInitial =
            track.title.charAt(0).toUpperCase() ||
            track.artist.charAt(0).toUpperCase() ||
            "?";

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
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden border border-white/10 bg-white/5">
                  {track.cover ? (
                    <img
                      src={track.cover}
                      alt={track.title}
                      className="h-full w-full object-cover"
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

type BpmComparisonOperator = ">" | "<" | ">=" | "<=" | "=";

type BpmFilter = {
  operator: BpmComparisonOperator;
  value: number;
};

type SearchCriteria = {
  textTerms: string[];
  bpmFilters: BpmFilter[];
  keyFilters: string[];
  hasFilters: boolean;
};

function parseSearchQuery(query: string): SearchCriteria {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const criteria: SearchCriteria = {
    textTerms: [],
    bpmFilters: [],
    keyFilters: [],
    hasFilters: false,
  };

  for (const token of tokens) {
    const [maybeField, ...rest] = token.split(":");
    if (rest.length === 0) {
      criteria.textTerms.push(token);
      continue;
    }

    const field = maybeField.toLowerCase();
    const value = rest.join(":");

    if (field === "bpm") {
      const bpmFilter = parseBpmFilter(value);
      if (bpmFilter) {
        criteria.bpmFilters.push(bpmFilter);
        continue;
      }
    }

    if (field === "key") {
      if (value) {
        criteria.keyFilters.push(value);
        continue;
      }
    }

    criteria.textTerms.push(token);
  }

  criteria.hasFilters =
    criteria.textTerms.length > 0 ||
    criteria.bpmFilters.length > 0 ||
    criteria.keyFilters.length > 0;
  return criteria;
}

function parseBpmFilter(value: string): BpmFilter | null {
  const match = /^(<=|>=|>|<|=)?\s*(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const operator = (match[1] as BpmComparisonOperator) ?? "=";
  const parsedValue = Number(match[2]);
  if (Number.isNaN(parsedValue)) return null;
  return {
    operator,
    value: parsedValue,
  };
}

function matchesSearchCriteria(
  track: Track,
  criteria: SearchCriteria,
): boolean {
  if (!criteria.hasFilters) return true;
  if (!matchesBpmFilters(track, criteria.bpmFilters)) return false;
  if (!matchesKeyFilters(track, criteria.keyFilters)) return false;
  if (!matchesTextTerms(track, criteria.textTerms)) return false;
  return true;
}

function matchesBpmFilters(track: Track, filters: BpmFilter[]): boolean {
  if (!filters.length) return true;
  const bpm = Number(track.bpm);
  if (Number.isNaN(bpm)) return false;
  return filters.every((filter) => {
    switch (filter.operator) {
      case ">":
        return bpm > filter.value;
      case ">=":
        return bpm >= filter.value;
      case "<":
        return bpm < filter.value;
      case "<=":
        return bpm <= filter.value;
      case "=":
      default:
        return bpm === filter.value;
    }
  });
}

function matchesKeyFilters(track: Track, filters: string[]): boolean {
  if (!filters.length) return true;
  const normalizedKey = track.key.toLowerCase().replace(/\s+/g, "");
  return filters.every((filter) =>
    normalizedKey.includes(filter.toLowerCase().replace(/\s+/g, "")),
  );
}

function matchesTextTerms(track: Track, terms: string[]): boolean {
  if (!terms.length) return true;
  const fields = [
    track.title,
    track.artist,
    track.id,
    track.key,
    track.duration,
    String(track.bpm ?? ""),
    track.annotation?.note ?? "",
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return terms.every((term) => {
    const normalizedTerm = term.toLowerCase();
    return fields.some((field) => fuzzyMatch(field, normalizedTerm));
  });
}

function fuzzyMatch(source: string, query: string): boolean {
  if (!query.length) return true;
  let sourceIndex = 0;
  let queryIndex = 0;

  while (sourceIndex < source.length && queryIndex < query.length) {
    if (source[sourceIndex] === query[queryIndex]) {
      queryIndex += 1;
    }
    sourceIndex += 1;
  }

  return queryIndex === query.length;
}
