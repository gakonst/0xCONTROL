import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import type { Track } from "@/data/tracks";
import type { Playlist } from "@/types/playlists";
import { cn } from "@/lib/utils";
import {
  LibraryHeader,
  LibrarySearchControls,
} from "@/components/library-header";
import {
  FooterToolsPortal,
  PLAYLIST_FOOTER_TOOLS_TARGET_ID,
} from "@/components/footer-tools-portal";
import type { PlaylistMetaUpdates } from "@/data/playlists";
import {
  ActionSheet,
  ActionSheetContent,
} from "@/components/ui/action-sheet";

export type PlaylistSortField = "title" | "createdAt" | "updatedAt";
export type PlaylistSortDirection = "asc" | "desc";

type PlaylistBrowserProps = {
  playlists: Playlist[];
  isLoading?: boolean;
  tracks: Track[];
  onSelect: (playlistId: string) => void;
  folderPath: string[];
  onFolderPathChange: Dispatch<SetStateAction<string[]>>;
  sortField: PlaylistSortField;
  sortDirection: PlaylistSortDirection;
  onSortChange: (field: PlaylistSortField, direction: PlaylistSortDirection) => void;
  onSortReset: () => void;
  onTogglePin: (playlistId: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onUpdatePlaylist?: (
    playlistId: string,
    updates: PlaylistMetaUpdates,
  ) => Promise<Playlist | null>;
  footerToolsActive?: boolean;
};

export function PlaylistBrowser({
  playlists,
  isLoading = false,
  tracks,
  onSelect,
  folderPath,
  onFolderPathChange,
  sortField,
  sortDirection,
  onSortChange,
  onSortReset,
  onTogglePin,
  onDeletePlaylist,
  onUpdatePlaylist,
  footerToolsActive = false,
}: PlaylistBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Playlist | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMood, setEditMood] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const activeFolderPath = folderPath;
  const isSearching = searchQuery.trim().length > 0;

  const trackMap = useMemo(() => {
    return new Map(tracks.map((track) => [track.id, track]));
  }, [tracks]);

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowLoading(true);
    }, 160);

    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!activeFolderPath.length) return;
    if (!playlists.length) return;
    const pathIsValid = playlists.some((playlist) => {
      const playlistFolderPath = playlist.folderPath ?? [];
      if (playlistFolderPath.length < activeFolderPath.length) return false;
      return activeFolderPath.every(
        (segment, index) => playlistFolderPath[index] === segment,
      );
    });
    if (!pathIsValid) {
      onFolderPathChange([]);
    }
  }, [playlists, activeFolderPath, onFolderPathChange]);

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
    const result = [...filteredPlaylists].sort((a, b) =>
      comparePlaylistsByField(a, b, sortField),
    );
    return sortDirection === "asc" ? result : result.reverse();
  }, [filteredPlaylists, sortField, sortDirection]);

  type ChildFolder = { name: string; count: number };
  const folderNavEnabled = !isSearching;

  const { visiblePlaylists, childFolders } = useMemo(() => {
    if (!folderNavEnabled) {
      return { visiblePlaylists: sortedPlaylists, childFolders: [] as ChildFolder[] };
    }

    const foldersMap = new Map<string, ChildFolder>();
    const playlistsInFolder: Playlist[] = [];

    for (const playlist of sortedPlaylists) {
      const folderPath = playlist.folderPath ?? [];
      if (folderPath.length < activeFolderPath.length) {
        continue;
      }
      const matchesPrefix = activeFolderPath.every(
        (segment, index) => folderPath[index] === segment,
      );
      if (!matchesPrefix) {
        continue;
      }

      if (folderPath.length === activeFolderPath.length) {
        playlistsInFolder.push(playlist);
        continue;
      }

      const nextSegment = folderPath[activeFolderPath.length];
      if (!nextSegment) {
        playlistsInFolder.push(playlist);
        continue;
      }

      const key = nextSegment.toLowerCase();
      const existing = foldersMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        foldersMap.set(key, { name: nextSegment, count: 1 });
      }
    }

    const sortedFolders = [...foldersMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return { visiblePlaylists: playlistsInFolder, childFolders: sortedFolders };
  }, [folderNavEnabled, sortedPlaylists, activeFolderPath]);

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

  const handleRequestDelete = (playlist: Playlist) => {
    setPendingDelete(playlist);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    onDeletePlaylist(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleRequestEdit = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setEditTitle(playlist.title);
    setEditMood(playlist.mood);
    setEditFolder((playlist.folderPath ?? []).join(" / "));
  };

  const handleSaveEdit = async () => {
    if (!editingPlaylist || !onUpdatePlaylist || !editTitle.trim()) return;
    setIsSavingEdit(true);
    const updated = await onUpdatePlaylist(editingPlaylist.id, {
      title: editTitle.trim(),
      mood: editMood.trim(),
      folderPath: editFolder
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean),
    });
    setIsSavingEdit(false);
    if (updated) setEditingPlaylist(null);
  };

  const isEmpty = playlists.length === 0;

  const contentPlaylists = folderNavEnabled ? visiblePlaylists : sortedPlaylists;

  const pinnedPlaylists = useMemo(() => {
    const pinned = playlists.filter((playlist) => playlist.isPinned);
    if (!pinned.length) return [];
    const sortedPinned = [...pinned].sort((a, b) =>
      comparePlaylistsByField(a, b, sortField),
    );
    return sortDirection === "asc" ? sortedPinned : sortedPinned.reverse();
  }, [playlists, sortField, sortDirection]);

  const shouldInjectPinned = folderNavEnabled && pinnedPlaylists.length > 0;

  const pinnedIdSet = useMemo(
    () => new Set(pinnedPlaylists.map((playlist) => playlist.id)),
    [pinnedPlaylists],
  );

  const unpinnedPlaylists = useMemo(() => {
    if (!shouldInjectPinned) {
      return contentPlaylists;
    }
    return contentPlaylists.filter((playlist) => !pinnedIdSet.has(playlist.id));
  }, [shouldInjectPinned, contentPlaylists, pinnedIdSet]);

  const aggregateTrackCount = contentPlaylists.reduce(
    (total, playlist) => total + playlist.trackIds.length,
    0,
  );

  const statsParts = [
    `${contentPlaylists.length} playlists`,
    isSearching && contentPlaylists.length !== playlists.length
      ? `filtered from ${playlists.length}`
      : null,
    `${aggregateTrackCount} tracks total`,
  ]
    .filter(Boolean)
    .join(" • ");

  const handleEnterFolder = (folderName: string) => {
    onFolderPathChange((previous) => [...previous, folderName]);
  };

  const handleLeaveFolder = () => {
    onFolderPathChange((previous) => previous.slice(0, -1));
  };

  const matchesActiveFolder = (playlist: Playlist) => {
    if (!activeFolderPath.length) {
      return true;
    }
    const folderPath = playlist.folderPath ?? [];
    if (folderPath.length < activeFolderPath.length) {
      return false;
    }
    return activeFolderPath.every(
      (segment, index) => folderPath[index] === segment,
    );
  };

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

  const renderPlaylistRow = (playlist: Playlist) => {
    const playlistTracks = playlist.trackIds
      .map((trackId) => trackMap.get(trackId))
      .filter(Boolean) as Track[];
    const durationLabel = formatTotalDuration(playlistTracks) || "0m";
    const fallbackInitial =
      playlist.title.charAt(0).toUpperCase() ||
      playlist.mood.charAt(0).toUpperCase() ||
      "?";
    const folderHint =
      shouldInjectPinned &&
      pinnedIdSet.has(playlist.id) &&
      !matchesActiveFolder(playlist)
        ? playlist.folderPath && playlist.folderPath.length
            ? playlist.folderPath.join(" / ")
            : "All playlists"
        : undefined;

    return (
      <PlaylistListRow
        key={playlist.id}
        playlist={playlist}
        onSelect={onSelect}
        trackCount={playlistTracks.length}
        durationLabel={durationLabel}
        updatedLabel={formatRelativeDate(playlist.updatedAt)}
        fallbackInitial={fallbackInitial}
        onTogglePin={onTogglePin}
        onRequestDelete={handleRequestDelete}
        onRequestEdit={onUpdatePlaylist ? handleRequestEdit : undefined}
        folderHint={folderHint}
      />
    );
  };

  if (isLoading && !showLoading) {
    return <section className="h-full w-full" />;
  }

  if (isLoading) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-white/10 bg-black/30 text-center text-sm text-muted-foreground">
        <p>Loading playlists...</p>
      </section>
    );
  }

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

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-background shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur">
      <FooterToolsPortal
        active={footerToolsActive}
        targetId={PLAYLIST_FOOTER_TOOLS_TARGET_ID}
      >
        <LibrarySearchControls
          search={{
            id: "playlist-search",
            value: searchQuery,
            placeholder: "Search playlists or tags",
            label: "Search playlists",
            onChange: setSearchQuery,
          }}
          onClearSearch={() => setSearchQuery("")}
          extraControls={extraControls}
          className="px-4 py-3"
        />
      </FooterToolsPortal>
      <ActionSheet
        open={Boolean(editingPlaylist)}
        onOpenChange={(open) => !open && setEditingPlaylist(null)}
      >
        {editingPlaylist && (
          <ActionSheetContent
            title="Edit playlist"
            description="Long-press playlist settings"
          >
            <form
              className="grid gap-3 px-1 pb-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveEdit();
              }}
            >
              <label className="grid gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-white/60">
                Name
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="h-10 border border-white/30 bg-white/5 px-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-white/40"
                />
              </label>
              <label className="grid gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-white/60">
                Mood
                <input
                  value={editMood}
                  onChange={(event) => setEditMood(event.target.value)}
                  className="h-10 border border-white/30 bg-white/5 px-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:ring-1 focus:ring-white/40"
                />
              </label>
              <label className="grid gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-white/60">
                Folder
                <input
                  value={editFolder}
                  onChange={(event) => setEditFolder(event.target.value)}
                  placeholder="Sets / 2026"
                  className="h-10 border border-white/30 bg-white/5 px-3 text-sm font-normal normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:ring-1 focus:ring-white/40"
                />
              </label>
              <button
                type="submit"
                disabled={!editTitle.trim() || isSavingEdit}
                className="mt-1 h-11 border border-white/60 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12rem] text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {isSavingEdit ? "Saving…" : "Save changes"}
              </button>
            </form>
          </ActionSheetContent>
        )}
      </ActionSheet>
      {pendingDelete && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md border border-white/10 bg-black/80 p-5 text-white shadow-[0_25px_60px_rgba(0,0,0,0.6)]">
            <p className="text-sm font-semibold uppercase tracking-[0.12rem] text-white/70">
              Delete playlist
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {pendingDelete.title}
            </p>
            <p className="mt-2 text-xs text-white/60">
              This will remove the playlist and its track mapping. Tracks stay in your library.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12rem] text-white/70 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="border border-rose-400/70 bg-rose-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12rem] text-rose-100 transition hover:bg-rose-500/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
        showSearchControls={false}
        extraControls={extraControls}
      />
      <div className="flex-1 overflow-auto pb-6">
        {isEmpty && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-white/10 bg-black/30 text-center text-sm text-muted-foreground">
            <p>No playlists yet.</p>
            <p className="text-xs text-white/60">
              Use the Create tab below to start drafting one.
            </p>
          </div>
        )}

        {!isEmpty && (
          <>
        {folderNavEnabled && activeFolderPath.length > 0 && (
          <button
            type="button"
            onClick={handleLeaveFolder}
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
                {activeFolderPath[activeFolderPath.length - 1]}
              </p>
              <p className="text-[0.65rem] uppercase tracking-tight text-muted-foreground md:text-xs">
                Up one level
              </p>
            </div>
            <div className="text-[0.7rem] text-muted-foreground md:text-xs">
              {activeFolderPath.length > 1
                ? activeFolderPath.slice(0, -1).join(" / ")
                : "All playlists"}
            </div>
          </button>
        )}

        {shouldInjectPinned && (
          <div className="space-y-1 pb-2">
            <p className="px-3.5 text-[0.6rem] uppercase tracking-[0.08rem] text-muted-foreground/80 md:px-5">
              Pinned
            </p>
            {pinnedPlaylists.map(renderPlaylistRow)}
          </div>
        )}

        {folderNavEnabled &&
          childFolders.map((folder) => (
            <button
              key={folder.name}
              type="button"
              onClick={() => handleEnterFolder(folder.name)}
              className={cn(
                "group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
                "min-h-[3.5rem] hover:bg-white/5/40",
              )}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-white/10 bg-white/5 text-[0.85rem] text-white/70">
                📁
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[0.9rem] font-semibold text-foreground md:text-base">
                  {folder.name}
                </p>
                <p className="text-[0.65rem] uppercase tracking-tight text-muted-foreground md:text-xs">
                  {folder.count} playlist{folder.count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-[0.7rem] text-muted-foreground md:text-xs">→</div>
            </button>
          ))}

       {unpinnedPlaylists.map(renderPlaylistRow)}

        {!unpinnedPlaylists.length &&
          folderNavEnabled &&
          !childFolders.length && (
            <div className="flex min-h-[3.5rem] items-center px-3.5 text-sm text-muted-foreground md:px-5">
              Empty folder.
            </div>
          )}
        </>
        )}
      </div>
    </section>
  );
}

type PlaylistListRowProps = {
  playlist: Playlist;
  onSelect: (playlistId: string) => void;
  onTogglePin: (playlistId: string) => void;
  onRequestDelete: (playlist: Playlist) => void;
  onRequestEdit?: (playlist: Playlist) => void;
  trackCount: number;
  durationLabel: string;
  updatedLabel: string;
  fallbackInitial: string;
  folderHint?: string;
};

function PlaylistListRow({
  playlist,
  onSelect,
  onTogglePin,
  onRequestDelete,
  onRequestEdit,
  trackCount,
  durationLabel,
  updatedLabel,
  fallbackInitial,
  folderHint,
}: PlaylistListRowProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const actionThreshold = 72;
  const maxOffset = 140;

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
    if (onRequestEdit) {
      longPressTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = true;
        onRequestEdit(playlist);
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

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const delta = clampOffset(event.clientX - startXRef.current);
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    resetDrag();
    if (delta > actionThreshold) {
      onTogglePin(playlist.id);
    } else if (delta < -actionThreshold) {
      onRequestDelete(playlist);
    }
    if (Math.abs(delta) > 6) {
      suppressClickRef.current = true;
    }
  };

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (pointerIdRef.current !== event.pointerId) return;
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
    onSelect(playlist.id);
  };

  const pinProgress = dragOffset > 0 ? Math.min(1, dragOffset / actionThreshold) : 0;
  const deleteProgress = dragOffset < 0 ? Math.min(1, -dragOffset / actionThreshold) : 0;

  const secondaryLine = folderHint
    ? `${playlist.mood} • ${folderHint}`
    : playlist.mood;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 flex overflow-hidden">
        <div
          className="flex-1 bg-sky-500/20"
          style={{ opacity: pinProgress }}
        />
        <div
          className="flex-1 bg-rose-500/25"
          style={{ opacity: deleteProgress }}
        />
      </div>
      {pinProgress > 0 && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-lg text-sky-100 md:pl-5">
          📌
        </div>
      )}
      {deleteProgress > 0 && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-lg text-rose-100 md:pr-5">
          🗑
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(event) => {
          if (!onRequestEdit) return;
          event.preventDefault();
          event.stopPropagation();
          onRequestEdit(playlist);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
        className={cn(
          "group relative z-10 flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition md:px-5",
          "min-h-[3.5rem] select-none hover:bg-white/5/40",
        )}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? "none" : "transform 160ms ease",
          touchAction: "pan-y",
        }}
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
          <div className="flex items-center gap-1">
            <p className="truncate text-[0.9rem] font-semibold text-foreground md:text-base">
              {playlist.title}
            </p>
            {playlist.isPinned && <span className="text-[0.7rem]">📌</span>}
          </div>
          <p className="truncate text-[0.65rem] text-muted-foreground md:text-xs">
            {secondaryLine}
          </p>
        </div>

        <div className="ml-auto flex w-[120px] flex-shrink-0 flex-col items-end text-right md:w-[130px]">
          <span className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
            {trackCount} tracks
          </span>
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted-foreground md:text-sm">
            <span className="inline-flex min-w-[3.5rem] justify-center rounded-none border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-tight text-black/80 md:text-xs">
              {durationLabel}
            </span>
            <span className="text-[0.7rem] md:text-xs">{updatedLabel}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

function comparePlaylistsByField(
  a: Playlist,
  b: Playlist,
  field: PlaylistSortField,
): number {
  switch (field) {
    case "createdAt":
    case "updatedAt": {
      const aTime = new Date(a[field]).getTime();
      const bTime = new Date(b[field]).getTime();
      return aTime - bTime;
    }
    case "title":
    default:
      return a.title.localeCompare(b.title);
  }
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
