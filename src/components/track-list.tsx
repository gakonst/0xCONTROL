import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";

import { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";
import { cn } from "@/lib/utils";
import {
  LibraryHeader,
  LibrarySearchControls,
} from "@/components/library-header";
import {
  FooterToolsPortal,
  TRACK_FOOTER_TOOLS_TARGET_ID,
} from "@/components/footer-tools-portal";
import { OverviewCanvas } from "@/components/waveform-canvas";
import { useWaveform } from "@/hooks/use-waveform";
import { prefetchStreamPreview } from "@/lib/stream-prefetch";
import { useOnScreen } from "@/hooks/use-on-screen";
import { formatSecondsToClock } from "@/lib/time";
import { useDownloads } from "@/components/download-status";
import { getPlaylistDownloadUrl } from "@/lib/downloads";
import { getTrackDownloadUrl } from "@/lib/downloads";
import {
  ActionSheet,
  ActionSheetClose,
  ActionSheetContent,
  SheetAction,
} from "@/components/ui/action-sheet";

export type TrackSortField = "title" | "bpm" | "key" | null;
export type TrackSortDirection = "asc" | "desc";

type QuickActionHandler = (trackId: string) => boolean;

type TrackListProps = {
  tracks: Track[];
  isLoading?: boolean;
  activeTrackId: string;
  onSelect: (
    track: Track,
    displayedQueue?: Track[],
    followsCanonicalOrder?: boolean,
  ) => void;
  className?: string;
  header?: TrackListHeaderConfig;
  sortField?: TrackSortField;
  sortDirection?: TrackSortDirection;
  onSortChange?: (field: TrackSortField, direction: TrackSortDirection) => void;
  onSortReset?: () => void;
  quickAddLabel?: string;
  onQuickAddToPlaylist?: QuickActionHandler;
  quickArchiveLabel?: string;
  onQuickArchiveToPlaylist?: QuickActionHandler;
  quickRemoveLabel?: string;
  onQuickRemoveFromPlaylist?: QuickActionHandler;
  onMoveTrack?: (trackId: string, direction: -1 | 1) => boolean;
  annotations?: Record<string, TrackAnnotation>;
  emptyState?: {
    title: string;
    description?: string;
  };
  playback?: {
    trackId: string;
    isPlaying: boolean;
    elapsedSeconds: number;
    durationSeconds?: number | null;
    liveTimeGetter?: () => number;
  };
  footerToolsActive?: boolean;
};

type TrackListHeaderConfig = {
  eyebrow?: string;
  title?: string;
  description?: string;
  onBack?: () => void;
  backLabel?: string;
  backDestinationLabel?: string;
  showFullBackRow?: boolean;
  playlistId?: string;
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
  isLoading = false,
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
  quickArchiveLabel,
  onQuickArchiveToPlaylist,
  quickRemoveLabel,
  onQuickRemoveFromPlaylist,
  onMoveTrack,
  annotations,
  emptyState,
  playback,
  footerToolsActive = false,
}: TrackListProps) {
  const { startDownload } = useDownloads();
  const annotationMap = annotations ?? {};
  const [searchQuery, setSearchQuery] = useState("");
  const [uncontrolledSortField, setUncontrolledSortField] =
    useState<TrackSortField>(null);
  const [uncontrolledSortDirection, setUncontrolledSortDirection] =
    useState<TrackSortDirection>("asc");
  const [showLoading, setShowLoading] = useState(false);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

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
  const quickArchiveEnabled =
    typeof onQuickArchiveToPlaylist === "function" &&
    Boolean(quickArchiveLabel);
  const quickRemoveEnabled =
    typeof onQuickRemoveFromPlaylist === "function" &&
    Boolean(quickRemoveLabel);

  const showFullBackRow = Boolean(header?.onBack && header?.showFullBackRow);

  const searchCriteria = useMemo(
    () => parseSearchQuery(searchQuery),
    [searchQuery],
  );

  const annotatedTracks = useMemo(() => {
    if (!annotations || Object.keys(annotationMap).length === 0) return tracks;
    return tracks.map((track) => {
      const override = annotationMap[track.id];
      return override ? { ...track, annotation: override } : track;
    });
  }, [tracks, annotationMap, annotations]);

  const filteredTracks = useMemo(() => {
    if (!searchCriteria.hasFilters) return annotatedTracks;
    return annotatedTracks.filter((track) =>
      matchesSearchCriteria(track, searchCriteria),
    );
  }, [annotatedTracks, searchCriteria]);

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
    searchCriteria.hasFilters || sortedTracks.length !== annotatedTracks.length;
  const isInitialLoading = isLoading && tracks.length === 0;
  useEffect(() => {
    if (!isInitialLoading) {
      setShowLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowLoading(true);
    }, 160);

    return () => window.clearTimeout(timer);
  }, [isInitialLoading]);
  const showEmptyState =
    sortedTracks.length === 0 &&
    !isFilteredView &&
    Boolean(emptyState) &&
    !isInitialLoading;

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
  const actionTrackIndex = actionTrack
    ? tracks.findIndex((track) => track.id === actionTrack.id)
    : -1;

  const statsLine = [
    `${sortedTracks.length} tracks`,
    isFilteredView ? `filtered from ${tracks.length}` : null,
    totalDurationLabel,
  ]
    .filter(Boolean)
    .join(" • ");

  const extraControls = (
    <div className="space-y-1">
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
      {header?.playlistId && (
        <button
          type="button"
          onClick={() =>
            startDownload(
              getPlaylistDownloadUrl(header.playlistId!),
              `${headingTitle}.zip`,
            )
          }
          disabled={tracks.length === 0}
          className="w-full border border-white/30 px-2 py-1 text-center text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-foreground transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 md:text-[0.65rem]"
        >
          Download playlist ZIP
        </button>
      )}
    </div>
  );

  return (
    <section
      className={cn(
        "flex h-full flex-col overflow-hidden overflow-x-hidden bg-background shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur",
        className,
      )}
    >
      <FooterToolsPortal
        active={footerToolsActive}
        targetId={TRACK_FOOTER_TOOLS_TARGET_ID}
      >
        <LibrarySearchControls
          search={{
            id: "track-search",
            value: searchQuery,
            placeholder: 'Search titles, artists, or use "bpm:>130"',
            label: "Search tracks",
            onChange: setSearchQuery,
          }}
          onClearSearch={() => setSearchQuery("")}
          extraControls={extraControls}
          className="px-4 py-3"
        />
      </FooterToolsPortal>
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
        showSearchControls={false}
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

      <div className="flex-1 overflow-auto overflow-x-hidden pb-6">
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
        {isInitialLoading && showLoading ? (
          <div className="mx-4 mt-10 rounded-none border border-white/10 bg-white/5 px-5 py-6 text-center text-white/70 md:mx-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12rem] text-white/70">
              Loading tracks...
            </p>
          </div>
        ) : showEmptyState ? (
          <div className="mx-4 mt-10 rounded-none border border-white/10 bg-white/5 px-5 py-6 text-center text-white/80 md:mx-6">
            <p className="text-sm font-semibold uppercase tracking-[0.12rem] text-white/80">
              {emptyState?.title}
            </p>
            {emptyState?.description && (
              <p className="mt-2 text-xs text-white/55">
                {emptyState.description}
              </p>
            )}
          </div>
        ) : (
          sortedTracks.map((track) => (
            <TrackListRow
              key={track.id}
              track={track}
              isActive={activeTrackId === track.id}
              onSelect={(selected) =>
                onSelect(
                  selected,
                  sortedTracks,
                  !sortField && !searchCriteria.hasFilters,
                )
              }
              onOpenActions={setActionTrack}
              onQuickAdd={quickAddEnabled ? onQuickAddToPlaylist : undefined}
              onQuickArchive={
                quickArchiveEnabled ? onQuickArchiveToPlaylist : undefined
              }
              onQuickRemove={
                quickRemoveEnabled ? onQuickRemoveFromPlaylist : undefined
              }
              quickAddLabel={quickAddLabel}
              quickArchiveLabel={quickArchiveLabel}
              quickRemoveLabel={quickRemoveLabel}
              playback={
                playback?.trackId === track.id ? playback : undefined
              }
            />
          ))
        )}
      </div>
      <ActionSheet
        open={Boolean(actionTrack)}
        onOpenChange={(open) => !open && setActionTrack(null)}
      >
        {actionTrack && (
          <ActionSheetContent
            title={actionTrack.title}
            description={`${actionTrack.artist} · long-press actions`}
          >
            {onMoveTrack && actionTrackIndex > 0 && (
              <ActionSheetClose asChild>
                <SheetAction
                  icon={<ArrowUp className="h-5 w-5" />}
                  label="Move earlier"
                  onClick={() => onMoveTrack(actionTrack.id, -1)}
                />
              </ActionSheetClose>
            )}
            {onMoveTrack &&
              actionTrackIndex >= 0 &&
              actionTrackIndex < tracks.length - 1 && (
                <ActionSheetClose asChild>
                  <SheetAction
                    icon={<ArrowDown className="h-5 w-5" />}
                    label="Move later"
                    onClick={() => onMoveTrack(actionTrack.id, 1)}
                  />
                </ActionSheetClose>
              )}
            <ActionSheetClose asChild>
              <SheetAction
                icon={<Download className="h-5 w-5" />}
                label="Download track"
                onClick={() =>
                  startDownload(
                    getTrackDownloadUrl(actionTrack.id),
                    actionTrack.title,
                  )
                }
              />
            </ActionSheetClose>
          </ActionSheetContent>
        )}
      </ActionSheet>
    </section>
  );
}

type TrackListRowProps = {
  track: Track;
  isActive: boolean;
  onSelect: (track: Track) => void;
  onOpenActions?: (track: Track) => void;
  onQuickAdd?: QuickActionHandler;
  onQuickArchive?: QuickActionHandler;
  onQuickRemove?: QuickActionHandler;
  quickAddLabel?: string;
  quickArchiveLabel?: string;
  quickRemoveLabel?: string;
  playback?: {
    trackId: string;
    isPlaying: boolean;
    elapsedSeconds: number;
    durationSeconds?: number | null;
    liveTimeGetter?: () => number;
  };
};

const TrackListRow = memo(function TrackListRow({
  track,
  isActive,
  onSelect,
  onOpenActions,
  onQuickAdd,
  onQuickArchive,
  onQuickRemove,
  quickAddLabel,
  quickArchiveLabel,
  quickRemoveLabel,
  playback,
}: TrackListRowProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const actionThreshold = 72;
  const maxOffset = 160;
  const canAdd = typeof onQuickAdd === "function";
  const canArchive = Boolean(onQuickArchive && quickArchiveLabel);
  const canRemove = Boolean(onQuickRemove && quickRemoveLabel);
  const leftAction = canRemove ? "remove" : canArchive ? "archive" : null;
  const rightAction = !canRemove && canAdd ? "add" : null;
  const fallbackInitial =
    track.title.charAt(0).toUpperCase() ||
    track.artist.charAt(0).toUpperCase() ||
    "?";
  const isVisible = useOnScreen(rowRef, { rootMargin: "256px" });
  const { data: waveformAnalysis } = useWaveform(track.id, {
    enabled: isVisible || isActive,
  });
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

  useEffect(() => {
    if (!(isVisible || isActive)) return;
    void prefetchStreamPreview(track.id);
  }, [isVisible, isActive, track.id]);

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
    if (onOpenActions) {
      longPressTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = true;
        onOpenActions(track);
      }, 550);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = clampOffset(event.clientX - startXRef.current);
    setDragOffset(delta);
    if (Math.abs(delta) > 6) {
      suppressClickRef.current = true;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
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
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    resetDrag();

    let handled = false;
    if (delta < -actionThreshold) {
      if (leftAction === "remove") {
        handled = onQuickRemove?.(track.id) ?? false;
      } else if (leftAction === "archive") {
        handled = onQuickArchive?.(track.id) ?? false;
      } else if (leftAction === "add") {
        handled = onQuickAdd?.(track.id) ?? false;
      }
    } else if (delta > actionThreshold) {
      if (rightAction === "add") {
        handled = onQuickAdd?.(track.id) ?? false;
      } else if (rightAction === "archive") {
        handled = onQuickArchive?.(track.id) ?? false;
      }
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
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
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

  const leftProgress = leftAction
    ? Math.min(Math.max(-dragOffset / actionThreshold, 0), 1)
    : 0;
  const rightProgress = rightAction
    ? Math.min(Math.max(dragOffset / actionThreshold, 0), 1)
    : 0;

  const colorClass = (() => {
    switch (track.annotation?.color) {
      case "red":
        return "bg-red-500";
      case "blue":
        return "bg-blue-500";
      case "pink":
        return "bg-pink-500";
      case "cyan":
        return "bg-cyan-400";
      default:
        return "bg-white/20";
    }
  })();

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      {(leftAction || rightAction) && (
        <>
          <div className="pointer-events-none absolute inset-0 flex overflow-hidden">
            <div
              className={
                leftAction === "remove"
                  ? "flex-1 bg-rose-500/15"
                  : leftAction === "archive"
                    ? "flex-1 bg-amber-500/15"
                    : "flex-1 bg-emerald-500/15"
              }
              style={{ opacity: leftProgress > 0 ? leftProgress : 0 }}
            />
            <div
              className={
                rightAction === "add"
                  ? "flex-1 bg-emerald-500/15"
                  : "flex-1 bg-amber-500/15"
              }
              style={{ opacity: rightProgress > 0 ? rightProgress : 0 }}
            />
          </div>
          {leftAction && (
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 md:pl-5",
                leftAction === "remove"
                  ? "text-rose-100"
                  : leftAction === "archive"
                    ? "text-amber-100"
                    : "text-emerald-100",
              )}
              style={{
                opacity: leftProgress > 0 ? Math.min(1, leftProgress + 0.2) : 0,
              }}
            >
              {leftAction === "archive" ? (
                <span className="text-lg">🗄</span>
              ) : (
                <span className="text-xl font-semibold">
                  {leftAction === "remove" ? "-" : "+"}
                </span>
              )}
            </div>
          )}
          {rightAction && (
            <div
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 md:pr-5",
                rightAction === "add" ? "text-emerald-100" : "text-amber-100",
              )}
              style={{
                opacity: rightProgress > 0
                  ? Math.min(1, rightProgress + 0.2)
                  : 0,
              }}
            >
              {rightAction === "add" ? (
                <span className="text-xl font-semibold">+</span>
              ) : (
                <span className="text-lg">🗄</span>
              )}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(event) => {
          if (!onOpenActions) return;
          event.preventDefault();
          event.stopPropagation();
          onOpenActions(track);
        }}
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
          <span className="flex items-center gap-2 truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-sm border border-white/30",
                colorClass,
              )}
              aria-hidden="true"
            />
            <span className="flex items-baseline gap-1">
              <span className="tabular-nums">{displayBpm}</span>
              <span className="text-[0.7rem] md:text-[0.75rem] uppercase">BPM</span>
            </span>
          </span>
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted-foreground md:text-sm">
            <span className="inline-flex w-10 justify-center rounded-none border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-tight text-black/80 md:text-xs">
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
});

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
