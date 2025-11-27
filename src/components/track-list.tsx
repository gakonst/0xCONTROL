import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";
import { LibraryHeader } from "@/components/library-header";
import { OverviewCanvas } from "@/components/waveform-canvas";
import { useWaveform } from "@/hooks/use-waveform";
import { formatSecondsToClock, parseDurationToSeconds } from "@/lib/time";

export type TrackSortField = "title" | "bpm" | "key" | null;
export type TrackSortDirection = "asc" | "desc";

type QuickActionHandler = (trackId: string) => boolean;

type TrackListProps = {
  tracks: Track[];
  activeTrackId: string;
  onSelect: (track: Track) => void;
  className?: string;
  header?: TrackListHeaderConfig;
  sortField?: TrackSortField;
  sortDirection?: TrackSortDirection;
  onSortChange?: (field: TrackSortField, direction: TrackSortDirection) => void;
  onSortReset?: () => void;
  quickAddLabel?: string;
  onQuickAddToPlaylist?: QuickActionHandler;
  quickRemoveLabel?: string;
  onQuickRemoveFromPlaylist?: QuickActionHandler;
  playback?: {
    trackId: string;
    isPlaying: boolean;
    elapsedSeconds: number;
    durationSeconds?: number | null;
    liveTimeGetter?: () => number;
  };
};

type TrackListHeaderConfig = {
  eyebrow?: string;
  title?: string;
  description?: string;
  onBack?: () => void;
  backLabel?: string;
  backDestinationLabel?: string;
  showFullBackRow?: boolean;
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
  header,
  sortField: controlledSortField,
  sortDirection: controlledSortDirection,
  onSortChange,
  onSortReset,
  quickAddLabel,
  onQuickAddToPlaylist,
  quickRemoveLabel,
  onQuickRemoveFromPlaylist,
  playback,
}: TrackListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [uncontrolledSortField, setUncontrolledSortField] =
    useState<TrackSortField>(null);
  const [uncontrolledSortDirection, setUncontrolledSortDirection] =
    useState<TrackSortDirection>("asc");

  const isSortControlled =
    controlledSortField !== undefined &&
    controlledSortDirection !== undefined &&
    typeof onSortChange === "function";

  const sortField = isSortControlled
    ? controlledSortField
    : uncontrolledSortField;
  const sortDirection = isSortControlled
    ? controlledSortDirection
    : uncontrolledSortDirection;
  const quickAddEnabled = typeof onQuickAddToPlaylist === "function";
  const quickRemoveEnabled =
    typeof onQuickRemoveFromPlaylist === "function" &&
    Boolean(quickRemoveLabel);

  const showFullBackRow = Boolean(header?.onBack && header?.showFullBackRow);

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

  const updateSort = (field: TrackSortField, direction: TrackSortDirection) => {
    if (isSortControlled) {
      onSortChange?.(field, direction);
    } else {
      setUncontrolledSortField(field);
      setUncontrolledSortDirection(direction);
    }
  };

  const handleSortSelection = (field: Exclude<TrackSortField, null>) => {
    if (sortField === field) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      updateSort(field, nextDirection);
      return;
    }

    updateSort(field, "asc");
  };

  const handleReset = () => {
    if (isSortControlled) {
      onSortReset?.();
    } else {
      setUncontrolledSortField(null);
      setUncontrolledSortDirection("asc");
    }
    setSearchQuery("");
  };

  const sortOptions = [
    { label: "A-Z", value: "title" as const },
    { label: "BPM", value: "bpm" as const },
    { label: "Key", value: "key" as const },
  ];

  const headingTitle = header?.title ?? "Collection";

  const statsLine = [
    `${sortedTracks.length} tracks`,
    isFilteredView ? `filtered from ${tracks.length}` : null,
    totalDurationLabel,
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
        onClick={handleReset}
        className="border border-white/30 px-2 py-1 text-[0.6rem] uppercase tracking-tight text-foreground transition hover:bg-white/5 md:text-[0.65rem] text-center"
      >
        Reset
      </button>
    </div>
  );

  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_rgba(3,7,18,0.95))] shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur",
        className,
      )}
    >
      <LibraryHeader
        title={headingTitle}
        eyebrow={header?.eyebrow}
        description={header?.description}
        stats={statsLine}
        search={{
          id: "track-search",
          value: searchQuery,
          placeholder:
            'Search titles, artists, or use filters like "bpm:>130"',
          label: "Search tracks",
          onChange: setSearchQuery,
        }}
        onClearSearch={() => setSearchQuery("")}
        backAction={
          header?.onBack && !showFullBackRow
            ? {
                onBack: header.onBack,
                label: header.backLabel,
              }
            : undefined
        }
        extraControls={extraControls}
      />

      <div className="flex-1 overflow-auto pb-6">
        {showFullBackRow && header?.onBack && (
          <button
            type="button"
            onClick={header.onBack}
            className={cn(
              "group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
              "min-h-[3.5rem] hover:bg-white/5/40",
            )}
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-white/10 bg-white/5 text-[0.85rem] text-white/70">
              ←
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-[0.9rem] font-semibold text-foreground md:text-base">
                {headingTitle}
              </p>
              <p className="text-[0.65rem] uppercase tracking-tight text-muted-foreground md:text-xs">
                {header.backLabel ?? "Up one level"}
              </p>
            </div>
            <div className="text-[0.7rem] text-muted-foreground md:text-xs">
              {header.backDestinationLabel ?? "All playlists"}
            </div>
          </button>
        )}
        {sortedTracks.map((track) => (
          <TrackListRow
            key={track.id}
            track={track}
            isActive={activeTrackId === track.id}
            onSelect={onSelect}
            onQuickAdd={quickAddEnabled ? onQuickAddToPlaylist : undefined}
            onQuickRemove={
              quickRemoveEnabled ? onQuickRemoveFromPlaylist : undefined
            }
            quickAddLabel={quickAddLabel}
            quickRemoveLabel={quickRemoveLabel}
            playback={playback}
          />
        ))}
      </div>
    </section>
  );
}

type TrackListRowProps = {
  track: Track;
  isActive: boolean;
  onSelect: (track: Track) => void;
  onQuickAdd?: QuickActionHandler;
  onQuickRemove?: QuickActionHandler;
  quickAddLabel?: string;
  quickRemoveLabel?: string;
  playback?: {
    trackId: string;
    isPlaying: boolean;
    elapsedSeconds: number;
    durationSeconds?: number | null;
    liveTimeGetter?: () => number;
  };
};

function TrackListRow({
  track,
  isActive,
  onSelect,
  onQuickAdd,
  onQuickRemove,
  quickAddLabel,
  quickRemoveLabel,
  playback,
}: TrackListRowProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const suppressClickRef = useRef(false);
  const actionThreshold = 72;
  const maxOffset = 160;
  const canAdd = typeof onQuickAdd === "function";
  const canRemove = Boolean(onQuickRemove && quickRemoveLabel);
  const fallbackInitial =
    track.title.charAt(0).toUpperCase() ||
    track.artist.charAt(0).toUpperCase() ||
    "?";
  const { data: waveformAnalysis } = useWaveform(track.id);
  const waveform = waveformAnalysis?.waveform ?? null;
  const isRowActive = playback?.trackId === track.id;
  const durationSeconds = waveform?.durationSeconds;
  const safeDurationSeconds =
    durationSeconds && durationSeconds > 0 ? durationSeconds : 1;
  const displayDuration = durationSeconds;
  const displayBpm =
    waveformAnalysis?.bpm !== undefined && waveformAnalysis?.bpm !== null
      ? Math.round(waveformAnalysis.bpm)
      : track.bpm;
  const liveTimeGetter = isRowActive ? playback?.liveTimeGetter : undefined;
  const baseCurrentTime = isRowActive ? playback?.elapsedSeconds ?? 0 : 0;
  const isRowPlaying = isRowActive ? playback?.isPlaying ?? false : false;

  const clampOffset = (value: number) => {
    return Math.max(Math.min(value, maxOffset), -maxOffset);
  };

  const resetDrag = () => {
    setDragOffset(0);
    setIsDragging(false);
    pointerIdRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    suppressClickRef.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = clampOffset(event.clientX - startXRef.current);
    setDragOffset(delta);
    if (Math.abs(delta) > 6) {
      suppressClickRef.current = true;
    }
  };

  const handlePointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const delta = clampOffset(event.clientX - startXRef.current);
    resetDrag();

    let handled = false;
    if (canAdd && delta > actionThreshold) {
      handled = onQuickAdd?.(track.id) ?? false;
    } else if (canRemove && delta < -actionThreshold) {
      handled = onQuickRemove?.(track.id) ?? false;
    }

    if (handled || Math.abs(delta) > 6) {
      suppressClickRef.current = true;
    }
  };

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetDrag();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    onSelect(track);
  };

  const addProgress = canAdd
    ? Math.min(Math.max(dragOffset / actionThreshold, 0), 1)
    : 0;
  const removeProgress = canRemove
    ? Math.min(Math.max(-dragOffset / actionThreshold, 0), 1)
    : 0;

  return (
    <div className="relative">
      {(canAdd || canRemove) && (
        <>
          <div className="pointer-events-none absolute inset-0 flex overflow-hidden">
            <div
              className="flex-1 bg-emerald-500/15"
              style={{ opacity: addProgress > 0 ? addProgress : 0 }}
            />
            <div
              className="flex-1 bg-rose-500/15"
              style={{ opacity: removeProgress > 0 ? removeProgress : 0 }}
            />
          </div>
          {canAdd && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-emerald-100 md:pl-5"
              style={{
                opacity: addProgress > 0 ? Math.min(1, addProgress + 0.2) : 0,
              }}
            >
              <span className="text-xl font-semibold">+</span>
            </div>
          )}
          {canRemove && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-rose-100 md:pr-5"
              style={{
                opacity: removeProgress > 0
                  ? Math.min(1, removeProgress + 0.2)
                  : 0,
              }}
            >
              <span className="text-xl font-semibold">-</span>
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
        className={cn(
          "group relative z-10 flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
          "min-h-[3.5rem] select-none",
          isActive ? "bg-white/5" : "hover:bg-white/5/40",
        )}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? "none" : "transform 160ms ease",
          touchAction: "pan-y",
        }}
      >
        <div className="flex items-center gap-2 text-xs font-medium tracking-tight text-muted-foreground">
          <div className="h-9 w-24 flex-shrink-0 overflow-hidden border border-white/10 bg-white/5 md:h-10 md:w-32">
            {waveform ? (
              <OverviewCanvas
                waveform={waveform}
                duration={safeDurationSeconds}
                bpm={waveformAnalysis?.bpm ?? track.bpm}
                beatOffsetSeconds={waveformAnalysis?.beatOffsetSeconds}
                isPlaying={false}
                baseCurrentTime={0}
                liveTimeGetter={undefined}
                showPlayhead={false}
                onSeek={() => {}}
                height={36}
                className="pointer-events-none relative h-9 w-full rounded-none md:h-10"
                rounded={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[0.7rem] font-semibold uppercase text-white/70">
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
            {displayBpm} BPM
          </span>
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted-foreground md:text-sm">
            <span className="inline-flex w-8 justify-center rounded-none border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-tight text-black/80 md:text-xs">
              {track.key}
            </span>
            <span className="text-[0.7rem] md:text-xs">
              {formatSecondsToClock(displayDuration)}
            </span>
          </div>
        </div>

      </button>
    </div>
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
