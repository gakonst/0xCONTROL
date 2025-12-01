import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { PlayerBar } from "@/components/player-bar";
import { FullScreenPlayer } from "@/components/fullscreen-player";
import {
  TrackList,
  type TrackSortDirection,
  type TrackSortField,
} from "@/components/track-list";
import { TrackNotesEditor } from "@/components/track-notes-editor";
import {
  PlaylistBrowser,
  type PlaylistSortDirection,
  type PlaylistSortField,
} from "@/components/playlist-browser";
import { PlaylistCreatePanel } from "@/components/playlist-create-panel";
import { LibraryTabs, type LibraryTabKey } from "@/components/library-tabs";
import { updateTrackAnnotation } from "@/data/annotations";
import {
  addTrackToPlaylist as addTrackToPlaylistApi,
  createPlaylist,
  fetchPlaylists,
  removeTrackFromPlaylist as removeTrackFromPlaylistApi,
  updatePlaylistMeta,
} from "@/data/playlists";
import { fetchCatalogTracks, getTrackUrl, type Track } from "@/data/tracks";
import { useMediaSession } from "@/hooks/use-media-session";
import { useWaveform } from "@/hooks/use-waveform";
import type { TrackAnnotation } from "@/types/annotations";
import type { Playlist } from "@/types/playlists";

type PlaylistsView = { type: "playlists"; folderPath: string[] };
type PlaylistDetailView = {
  type: "playlistDetail";
  playlistId: string;
  folderPath: string[];
};

type LibraryView =
  | { type: "home" }
  | PlaylistsView
  | PlaylistDetailView
  | { type: "create" };

type PrimaryLibraryView = { type: "home" } | PlaylistsView | { type: "create" };

const RAW_APP_BASE_PATH = (import.meta.env.BASE_URL ?? "/") as string;
const APP_BASE_PATH =
  RAW_APP_BASE_PATH === "/" ? "" : RAW_APP_BASE_PATH.replace(/\/+$/, "");

type ParsedUrlState = {
  view: LibraryView;
  trackId?: string;
  href: string;
  pathname: string;
  trackSortField: TrackSortField;
  trackSortDirection: TrackSortDirection;
  playlistSortField: PlaylistSortField;
  playlistSortDirection: PlaylistSortDirection;
};

function App() {
  const initialUrlState = getInitialUrlState();
  const initialPrimaryView: PrimaryLibraryView =
    initialUrlState.view.type === "playlistDetail"
      ? { type: "playlists", folderPath: initialUrlState.view.folderPath }
      : initialUrlState.view.type === "playlists"
        ? initialUrlState.view
        : initialUrlState.view;
  const [currentTrackId, setCurrentTrackId] = useState(
    initialUrlState.trackId ?? "",
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [isFullScreenPlayerOpen, setIsFullScreenPlayerOpen] = useState(false);
  const [annotations, setAnnotations] = useState<
    Record<string, TrackAnnotation>
  >({});
  const [libraryView, setLibraryView] = useState<LibraryView>(
    initialUrlState.view,
  );
  const [previousPrimaryView, setPreviousPrimaryView] =
    useState<PrimaryLibraryView>(initialPrimaryView);
  const [trackSortField, setTrackSortField] = useState<TrackSortField>(
    initialUrlState.trackSortField,
  );
  const [trackSortDirection, setTrackSortDirection] =
    useState<TrackSortDirection>(initialUrlState.trackSortDirection);
  const [playlistSortField, setPlaylistSortField] =
    useState<PlaylistSortField>(initialUrlState.playlistSortField);
  const [playlistSortDirection, setPlaylistSortDirection] =
    useState<PlaylistSortDirection>(initialUrlState.playlistSortDirection);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackUrlRef = useRef<string>("");
  const pendingNoteSavesRef = useRef(
    new Map<
      string,
      { timeoutId: ReturnType<typeof setTimeout>; note: string }
    >(),
  );
  const lastSyncedUrlRef = useRef(initialUrlState.href);
  const isHandlingPopStateRef = useRef(false);
  const hasSyncedOnceRef = useRef(false);

  const { data: fetchedTracks } = useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => fetchCatalogTracks(signal),
  });
  const emptyTracksRef = useRef<Track[]>([]);
  const tracks = fetchedTracks ?? emptyTracksRef.current;

  const {
    data: fetchedPlaylists,
    refetch: refetchPlaylists,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: ({ signal }) => fetchPlaylists(signal),
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [preferredPlaylistId, setPreferredPlaylistId] = useState<string | null>(
    null,
  );
  const [pendingQuickAddTrackId, setPendingQuickAddTrackId] = useState<string | null>(null);
  const [pendingQuickAddReturnView, setPendingQuickAddReturnView] =
    useState<LibraryView | null>(null);

  const applyRemotePlaylistUpdate = useCallback((updated: Playlist) => {
    if (!updated) return;
    setPlaylists((previous) => {
      const index = previous.findIndex((playlist) => playlist.id === updated.id);
      if (index === -1) {
        return previous;
      }
      const next = [...previous];
      next[index] = updated;
      return next;
    });
  }, []);

  const handlePlaylistCreated = useCallback(
    (playlist: Playlist) => {
      setPlaylists((previous) => [playlist, ...previous]);
      setPreferredPlaylistId(playlist.id);
      setLibraryView({
        type: "playlistDetail",
        playlistId: playlist.id,
        folderPath: playlist.folderPath ?? [],
      });
    },
    [],
  );

  useEffect(() => {
    if (Array.isArray(fetchedPlaylists)) {
      setPlaylists(fetchedPlaylists);
    }
  }, [fetchedPlaylists]);

  useEffect(() => {
    if (!playlists.length) {
      if (preferredPlaylistId !== null) {
        setPreferredPlaylistId(null);
      }
      return;
    }

    if (
      preferredPlaylistId &&
      playlists.some((playlist) => playlist.id === preferredPlaylistId)
    ) {
      return;
    }

    if (preferredPlaylistId !== null) {
      setPreferredPlaylistId(null);
    }
  }, [playlists, preferredPlaylistId]);

  const activePlaylist =
    libraryView.type === "playlistDetail"
      ? playlists.find((playlist) => playlist.id === libraryView.playlistId)
      : undefined;

  const quickAddTargetPlaylist = useMemo(() => {
    if (libraryView.type === "playlistDetail" && activePlaylist) {
      return activePlaylist;
    }

    if (preferredPlaylistId) {
      const preferred = playlists.find(
        (playlist) => playlist.id === preferredPlaylistId,
      );
      if (preferred) {
        return preferred;
      }
    }

    return null;
  }, [libraryView, activePlaylist, preferredPlaylistId, playlists]);

  const addTrackToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      let didAdd = false;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) {
            return playlist;
          }

          if (playlist.trackIds.includes(trackId)) {
            return playlist;
          }

          didAdd = true;
          return {
            ...playlist,
            trackIds: [...playlist.trackIds, trackId],
          };
        }),
      );

      if (didAdd) {
        void addTrackToPlaylistApi(playlistId, trackId)
          .then((updated) => {
            applyRemotePlaylistUpdate(updated);
          })
          .catch((error) => {
            console.error("Failed to add track to playlist", error);
            void refetchPlaylists();
          });
      }

      return didAdd;
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  const handleQuickAddToPlaylist = useCallback(
    (trackId: string) => {
      if (quickAddTargetPlaylist) {
        return addTrackToPlaylist(quickAddTargetPlaylist.id, trackId);
      }

      if (!playlists.length) {
        return false;
      }

      setPendingQuickAddTrackId(trackId);
      setPendingQuickAddReturnView(libraryView);
      if (libraryView.type !== "playlists") {
        const fallbackFolderPath =
          previousPrimaryView.type === "playlists"
            ? previousPrimaryView.folderPath
            : [];
        setLibraryView({ type: "playlists", folderPath: fallbackFolderPath });
      }
      return true;
    },
    [
      quickAddTargetPlaylist,
      addTrackToPlaylist,
      playlists.length,
      libraryView,
      previousPrimaryView,
    ],
  );

  const togglePlaylistPin = useCallback(
    (playlistId: string) => {
      let nextPinned: boolean | null = null;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) {
            return playlist;
          }
          nextPinned = !playlist.isPinned;
          return { ...playlist, isPinned: nextPinned };
        }),
      );

      if (nextPinned === null) {
        return;
      }

      void updatePlaylistMeta(playlistId, { isPinned: nextPinned })
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to update playlist pin state", error);
          void refetchPlaylists();
        });
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  const togglePlaylistFavorite = useCallback(
    (playlistId: string) => {
      let nextFavorite: boolean | null = null;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) {
            return playlist;
          }
          nextFavorite = !playlist.isFavorite;
          return { ...playlist, isFavorite: nextFavorite };
        }),
      );

      if (nextFavorite === null) {
        return;
      }

      void updatePlaylistMeta(playlistId, { isFavorite: nextFavorite })
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to update playlist favorite state", error);
          void refetchPlaylists();
        });
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      let didRemove = false;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) {
            return playlist;
          }

          if (!playlist.trackIds.includes(trackId)) {
            return playlist;
          }

          didRemove = true;
          return {
            ...playlist,
            trackIds: playlist.trackIds.filter((id) => id !== trackId),
          };
        }),
      );

      if (didRemove) {
        void removeTrackFromPlaylistApi(playlistId, trackId)
          .then((updated) => applyRemotePlaylistUpdate(updated))
          .catch((error) => {
            console.error("Failed to remove track from playlist", error);
            void refetchPlaylists();
          });
      }

      return didRemove;
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  useEffect(() => {
    if (libraryView.type !== "playlistDetail") {
      return;
    }
    if (!playlists.length) {
      return;
    }
    const exists = playlists.some(
      (playlist) => playlist.id === libraryView.playlistId,
    );
    if (!exists) {
      setLibraryView({
        type: "playlists",
        folderPath: libraryView.folderPath,
      });
    }
  }, [libraryView, playlists]);

  useEffect(() => {
    if (libraryView.type === "playlistDetail") {
      return;
    }
    setPreviousPrimaryView(libraryView);
  }, [libraryView]);

  useEffect(() => {
    if (!pendingQuickAddTrackId) {
      return;
    }
    if (libraryView.type === "playlists") {
      return;
    }
    setPendingQuickAddTrackId(null);
    setPendingQuickAddReturnView(null);
  }, [libraryView, pendingQuickAddTrackId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      isHandlingPopStateRef.current = true;
      const parsed = parseUrlStateFromLocation(window.location);
      lastSyncedUrlRef.current =
        window.location.pathname + window.location.search;
      setLibraryView(parsed.view);
      setCurrentTrackId(parsed.trackId ?? "");
      setTrackSortField(parsed.trackSortField);
      setTrackSortDirection(parsed.trackSortDirection);
      setPlaylistSortField(parsed.playlistSortField);
      setPlaylistSortDirection(parsed.playlistSortDirection);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextUrl = buildUrlWithState(
      libraryView,
      currentTrackId,
      trackSortField,
      trackSortDirection,
      playlistSortField,
      playlistSortDirection,
    );
    if (nextUrl === lastSyncedUrlRef.current) {
      isHandlingPopStateRef.current = false;
      return;
    }

    const method =
      hasSyncedOnceRef.current && !isHandlingPopStateRef.current
        ? "pushState"
        : "replaceState";
    window.history[method](null, "", nextUrl);
    lastSyncedUrlRef.current = nextUrl;
    hasSyncedOnceRef.current = true;
    isHandlingPopStateRef.current = false;
  }, [
    libraryView,
    currentTrackId,
    trackSortField,
    trackSortDirection,
    playlistSortField,
    playlistSortDirection,
  ]);

  const handleExitPlaylistDetail = useCallback(() => {
    setLibraryView(previousPrimaryView);
  }, [previousPrimaryView]);

  const visibleTracks = useMemo(() => {
    if (libraryView.type === "playlistDetail" && activePlaylist) {
      const playlistTrackIds = new Set(activePlaylist.trackIds);
      return tracks.filter((track) => playlistTrackIds.has(track.id));
    }
    return tracks;
  }, [tracks, libraryView, activePlaylist]);

  const previousLevelLabel =
    previousPrimaryView.type === "home"
      ? "Home"
      : previousPrimaryView.type === "create"
        ? "Create"
        : previousPrimaryView.folderPath.length
          ? previousPrimaryView.folderPath.join(" / ")
          : "All playlists";

  const trackListHeader =
    libraryView.type === "playlistDetail" && activePlaylist
      ? {
          title: activePlaylist.title,
          backLabel: "Up one level",
          backDestinationLabel: previousLevelLabel,
          onBack: handleExitPlaylistDetail,
          showFullBackRow: true,
        }
      : undefined;

  const activeTab: LibraryTabKey =
    libraryView.type === "create"
      ? "create"
      : libraryView.type === "home"
        ? "home"
        : "playlists";

  useEffect(() => {
    if (!tracks.length) {
      return;
    }

    const isCurrentTrackAvailable = tracks.some(
      (track) => track.id === currentTrackId,
    );
    if (!isCurrentTrackAvailable) {
      setCurrentTrackId(tracks[0].id);
    }
  }, [tracks, currentTrackId]);

  useEffect(() => {
    if (!tracks.length) return;
    setAnnotations((previous) => {
      let hasChanges = false;
      const next = { ...previous };
      for (const track of tracks) {
        if (!track.annotation) continue;
        if (next[track.id]) continue;
        next[track.id] = track.annotation;
        hasChanges = true;
      }
      return hasChanges ? next : previous;
    });
  }, [tracks]);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId) ?? tracks[0],
    [currentTrackId, tracks],
  );
  const currentAnnotation = currentTrack
    ? annotations[currentTrack.id]
    : undefined;
  const { data: currentWaveformAnalysis } = useWaveform(currentTrack?.id);
  const preferredDurationSeconds = currentWaveformAnalysis?.waveform
    ?.durationSeconds;

  const goToTrackByOffset = useCallback(
    (offset: number) => {
      if (!currentTrack || tracks.length === 0) return;
      const index = tracks.findIndex((track) => track.id === currentTrack.id);
      if (index === -1) return;
      const nextTrack =
        tracks[(index + offset + tracks.length) % tracks.length];
      setCurrentTrackId(nextTrack.id);
    },
    [currentTrack, tracks],
  );

  const goToNextTrack = useCallback(() => {
    goToTrackByOffset(1);
  }, [goToTrackByOffset]);

  const goToPreviousTrack = useCallback(() => {
    goToTrackByOffset(-1);
  }, [goToTrackByOffset]);

  const goToNextTrackRef = useRef(goToNextTrack);
  useEffect(() => {
    goToNextTrackRef.current = goToNextTrack;
  }, [goToNextTrack]);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }

    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setElapsedSeconds(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      setDurationSeconds(duration);
      setIsBuffering(false);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      if (audio.ended) return;
      setIsPlaying(false);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleEnded = () => {
      goToNextTrackRef.current();
      setIsPlaying(true);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => {
    if (!currentTrackId || !currentTrack) return;

    const ensureAudio = () => {
      if (!audioRef.current) {
        const audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;
      }
      return audioRef.current;
    };

    const audio = ensureAudio();
    if (!audio) return;

    const trackUrl = getTrackUrl(currentTrack.id);
    if (trackUrlRef.current !== trackUrl) {
      trackUrlRef.current = trackUrl;
      setIsBuffering(true);
      setElapsedSeconds(0);
      setDurationSeconds(null);
      audio.src = trackUrl;
      audio.load();
    }

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((error) => {
          console.error("Unable to start playback", error);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, currentTrackId, isPlaying]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handlePlayRequest = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePauseRequest = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || Number.isNaN(deltaSeconds)) return;

    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : undefined;

    const nextTime = Math.max(0, audio.currentTime + deltaSeconds);
    audio.currentTime =
      duration !== undefined ? Math.min(nextTime, duration) : nextTime;
  }, []);

  const handleSeekForward = useCallback(
    (offset = 10) => {
      seekBy(Math.abs(offset));
    },
    [seekBy],
  );

  const handleSeekBackward = useCallback(
    (offset = 10) => {
      seekBy(-Math.abs(offset));
    },
    [seekBy],
  );

  const handleSeekToPosition = useCallback((position: number) => {
    const audio = audioRef.current;
    if (!audio || typeof position !== "number" || Number.isNaN(position)) {
      return;
    }

    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : undefined;
    const nextTime = Math.max(0, position);
    audio.currentTime =
      duration !== undefined ? Math.min(nextTime, duration) : nextTime;
  }, []);

  const handleSeek = useCallback((nextSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : null;
    const safeTarget = (() => {
      if (duration && duration > 0) {
        return Math.min(Math.max(nextSeconds, 0), duration);
      }
      return Math.max(nextSeconds, 0);
    })();
    audio.currentTime = safeTarget;
    setElapsedSeconds(safeTarget);
  }, []);

  const persistAnnotation = useCallback(
    async (trackId: string, patch: Partial<TrackAnnotation>) => {
      try {
        await updateTrackAnnotation(trackId, patch);
      } catch (error) {
        console.error("Failed to save annotation", error);
      }
    },
    [],
  );

  const flushAllPendingNoteUpdates = useCallback(() => {
    const pendingEntries = pendingNoteSavesRef.current;
    for (const [trackId, entry] of pendingEntries.entries()) {
      clearTimeout(entry.timeoutId);
      const normalizedNote = entry.note.length > 0 ? entry.note : null;
      void persistAnnotation(trackId, { note: normalizedNote });
      pendingEntries.delete(trackId);
    }
  }, [persistAnnotation]);

  const scheduleNoteSave = useCallback(
    (trackId: string, note: string) => {
      const pendingEntries = pendingNoteSavesRef.current;
      const existing = pendingEntries.get(trackId);
      if (existing) {
        clearTimeout(existing.timeoutId);
      }

      const timeoutId = setTimeout(() => {
        pendingEntries.delete(trackId);
        const normalizedNote = note.length > 0 ? note : null;
        void persistAnnotation(trackId, { note: normalizedNote });
      }, 2000);

      pendingEntries.set(trackId, { timeoutId, note });
    },
    [persistAnnotation],
  );

  const handleAnnotationChange = useCallback(
    (partial: Partial<TrackAnnotation>) => {
      if (!currentTrack) return;
      const trackId = currentTrack.id;
      const existingAnnotation = annotations[trackId];
      const previousColor = existingAnnotation?.color ?? null;
      const previousNote = existingAnnotation?.note ?? "";

      setAnnotations((previous) => {
        const currentValue = previous[trackId] ?? {};
        const updated: TrackAnnotation = { ...currentValue };

        if ("color" in partial) {
          const nextColor = partial.color ?? null;
          if (nextColor) {
            updated.color = nextColor;
          } else {
            delete updated.color;
          }
        }

        if ("note" in partial) {
          const nextNote = partial.note ?? "";
          if (nextNote.length > 0) {
            updated.note = nextNote;
          } else {
            delete updated.note;
          }
        }

        const hasColor = "color" in updated;
        const hasNote = "note" in updated;

        if (!hasColor && !hasNote) {
          if (!(trackId in previous)) {
            return previous;
          }
          const { [trackId]: _removed, ...rest } = previous;
          return rest;
        }

        return {
          ...previous,
          [trackId]: updated,
        };
      });

      if (Object.prototype.hasOwnProperty.call(partial, "color")) {
        const nextColor = partial.color ?? null;
        if (nextColor !== previousColor) {
          void persistAnnotation(trackId, { color: nextColor });
        }
      }

      if (Object.prototype.hasOwnProperty.call(partial, "note")) {
        const nextNote = partial.note ?? "";
        if (nextNote !== previousNote) {
          scheduleNoteSave(trackId, nextNote);
        }
      }
    },
    [annotations, currentTrack, persistAnnotation, scheduleNoteSave],
  );

  const handleTrackSelect = useCallback((track: Track) => {
    setCurrentTrackId(track.id);
    setIsPlaying(true);
    setIsFullScreenPlayerOpen(false);
  }, []);

  const handlePlaylistSelect = useCallback(
    (playlistId: string) => {
      setPreferredPlaylistId(playlistId);
      const targetPlaylist = playlists.find(
        (playlist) => playlist.id === playlistId,
      );
      const targetFolderPath = targetPlaylist?.folderPath ?? [];

      if (pendingQuickAddTrackId) {
        const trackId = pendingQuickAddTrackId;
        setPendingQuickAddTrackId(null);
        setPendingQuickAddReturnView(null);
        void addTrackToPlaylist(playlistId, trackId);
        const destination =
          pendingQuickAddReturnView ?? ({ type: "home" } as LibraryView);
        setLibraryView(destination);
        return;
      }

      setLibraryView({
        type: "playlistDetail",
        playlistId,
        folderPath: targetFolderPath,
      });
    },
    [
      playlists,
      pendingQuickAddTrackId,
      pendingQuickAddReturnView,
      addTrackToPlaylist,
    ],
  );

  const handleTrackSortChange = useCallback(
    (field: TrackSortField, direction: TrackSortDirection) => {
      setTrackSortField(field);
      setTrackSortDirection(direction);
    },
    [],
  );

  const handleTrackSortReset = useCallback(() => {
    setTrackSortField(null);
    setTrackSortDirection("asc");
  }, []);

  const handlePlaylistSortChange = useCallback(
    (field: PlaylistSortField, direction: PlaylistSortDirection) => {
      setPlaylistSortField(field);
      setPlaylistSortDirection(direction);
    },
    [],
  );

  const handlePlaylistSortReset = useCallback(() => {
    setPlaylistSortField("title");
    setPlaylistSortDirection("asc");
  }, []);

  const handleFolderPathChange = useCallback<
    Dispatch<SetStateAction<string[]>>
  >((nextPath) => {
    setLibraryView((current) => {
      if (current.type !== "playlists") {
        return current;
      }
      const resolved =
        typeof nextPath === "function" ? nextPath(current.folderPath) : nextPath;
      const hasChanged =
        resolved.length !== current.folderPath.length ||
        resolved.some((segment, index) => segment !== current.folderPath[index]);
      if (!hasChanged) {
        return current;
      }
      return {
        ...current,
        folderPath: resolved,
      };
    });
  }, []);

  const handleTabChange = useCallback(
    (tab: LibraryTabKey) => {
      if (tab === "home") {
        setLibraryView({ type: "home" });
        return;
      }
      if (tab === "playlists") {
        const folderPath =
          previousPrimaryView.type === "playlists"
            ? previousPrimaryView.folderPath
            : [];
        setLibraryView({ type: "playlists", folderPath });
        return;
      }
      setLibraryView({ type: "create" });
    },
    [previousPrimaryView],
  );

  const handleOpenFullScreen = useCallback(() => {
    setIsFullScreenPlayerOpen(true);
  }, []);

  useMediaSession({
    track: currentTrack,
    isPlaying,
    elapsedSeconds,
    durationSeconds,
    onPlayRequest: handlePlayRequest,
    onPauseRequest: handlePauseRequest,
    onSkipNext: goToNextTrack,
    onSkipPrevious: goToPreviousTrack,
    onSeekBackward: handleSeekBackward,
    onSeekForward: handleSeekForward,
    onSeekTo: handleSeekToPosition,
  });

  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const isSpace =
        event.code === "Space" ||
        event.key === " " ||
        event.key?.toLowerCase() === "spacebar";
      if (!isSpace) {
        return;
      }

      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }

      if (!currentTrack && !currentTrackId) {
        return;
      }

      event.preventDefault();
      handleTogglePlay();
    };

    window.addEventListener("keydown", handleSpaceToggle);
    return () => {
      window.removeEventListener("keydown", handleSpaceToggle);
    };
  }, [currentTrack, currentTrackId, handleTogglePlay]);

  useEffect(() => {
    return () => {
      flushAllPendingNoteUpdates();
    };
  }, [flushAllPendingNoteUpdates]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#010308] text-foreground">
      <div className="flex flex-1 flex-col overflow-hidden pt-4">
        <div className="min-h-0 flex-1">
          {libraryView.type === "playlists" ? (
            <PlaylistBrowser
              playlists={playlists}
              tracks={tracks}
              onSelect={handlePlaylistSelect}
              folderPath={libraryView.folderPath}
              onFolderPathChange={handleFolderPathChange}
              sortField={playlistSortField}
              sortDirection={playlistSortDirection}
              onSortChange={handlePlaylistSortChange}
              onSortReset={handlePlaylistSortReset}
              onTogglePin={togglePlaylistPin}
              onToggleFavorite={togglePlaylistFavorite}
            />
          ) : libraryView.type === "create" ? (
            <PlaylistCreatePanel onPlaylistCreated={handlePlaylistCreated} />
          ) : (
            <TrackList
              className="h-full w-full"
              tracks={visibleTracks}
              activeTrackId={currentTrack?.id ?? ""}
              onSelect={handleTrackSelect}
              header={trackListHeader}
              sortField={trackSortField}
              sortDirection={trackSortDirection}
              onSortChange={handleTrackSortChange}
              onSortReset={handleTrackSortReset}
              quickAddLabel={quickAddTargetPlaylist?.title}
              onQuickAddToPlaylist={handleQuickAddToPlaylist}
              quickRemoveLabel={
                libraryView.type === "playlistDetail" && activePlaylist
                  ? activePlaylist.title
                  : undefined
              }
              onQuickRemoveFromPlaylist={
                libraryView.type === "playlistDetail" && activePlaylist
                  ? (trackId) =>
                      removeTrackFromPlaylist(activePlaylist.id, trackId)
                  : undefined
              }
              playback={{
                trackId: currentTrack?.id ?? "",
                isPlaying,
                elapsedSeconds,
                durationSeconds: preferredDurationSeconds ?? undefined,
                liveTimeGetter: () =>
                  audioRef.current?.currentTime ?? elapsedSeconds,
              }}
            />
          )}
        </div>
      </div>

      {currentTrack && (
        <div className="flex flex-col pb-2 shrink-0">
          <TrackNotesEditor
            track={currentTrack}
            annotation={currentAnnotation}
            onChange={handleAnnotationChange}
            className="border-b border-white/10"
          />
          <PlayerBar
            track={currentTrack}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            elapsedSeconds={elapsedSeconds}
            durationSeconds={preferredDurationSeconds ?? undefined}
            bpmOverride={currentWaveformAnalysis?.bpm ?? null}
            waveform={currentWaveformAnalysis?.waveform ?? null}
            liveTimeGetter={() =>
              audioRef.current?.currentTime ?? elapsedSeconds
            }
            onTogglePlay={handleTogglePlay}
            onSkipNext={goToNextTrack}
            onSkipPrevious={goToPreviousTrack}
            onOpenFullScreen={handleOpenFullScreen}
          />
          <LibraryTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      )}
      {isFullScreenPlayerOpen && currentTrack && (
        <FullScreenPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          elapsedSeconds={elapsedSeconds}
          durationSeconds={preferredDurationSeconds ?? undefined}
          waveform={currentWaveformAnalysis?.waveform ?? null}
          waveformBpm={currentWaveformAnalysis?.bpm ?? null}
          beatOffsetSeconds={currentWaveformAnalysis?.beatOffsetSeconds ?? null}
          liveTimeGetter={() =>
            audioRef.current?.currentTime ?? elapsedSeconds
          }
          onTogglePlay={handleTogglePlay}
          onSkipNext={goToNextTrack}
          onSkipPrevious={goToPreviousTrack}
          onClose={() => setIsFullScreenPlayerOpen(false)}
          onSeek={handleSeek}
          annotation={currentAnnotation}
          onAnnotationChange={handleAnnotationChange}
          activeTab={activeTab}
          onTabChange={(tab) => {
            handleTabChange(tab);
            setIsFullScreenPlayerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function getInitialUrlState(): ParsedUrlState {
  if (typeof window === "undefined") {
    return {
      view: { type: "home" },
      href: "/",
      pathname: "/",
      trackSortField: null,
      trackSortDirection: "asc",
      playlistSortField: "title",
      playlistSortDirection: "asc",
    };
  }

  return parseUrlStateFromLocation(window.location);
}

function parseUrlStateFromLocation(location: Location): ParsedUrlState {
  const params = new URLSearchParams(location.search);
  const relativePath = stripBasePath(location.pathname);
  let view = parseViewFromPath(relativePath);

  if (!view) {
    view = parseViewFromLegacyParams(params.get("view"), params);
  }

  const trackId = params.get("trackId") ?? undefined;
  const { field: parsedTrackSortField, direction: parsedTrackSortDirection } =
    parseTrackSortParam(params.get("sort"));
  const {
    field: parsedPlaylistSortField,
    direction: parsedPlaylistSortDirection,
  } = parsePlaylistSortParam(params.get("playlistSort"));

  return {
    view,
    trackId,
    href: location.pathname + location.search,
    pathname: location.pathname,
    trackSortField: parsedTrackSortField,
    trackSortDirection: parsedTrackSortDirection,
    playlistSortField: parsedPlaylistSortField,
    playlistSortDirection: parsedPlaylistSortDirection,
  };
}

function buildUrlWithState(
  view: LibraryView,
  trackId: string,
  trackSortField: TrackSortField,
  trackSortDirection: TrackSortDirection,
  playlistSortField: PlaylistSortField,
  playlistSortDirection: PlaylistSortDirection,
): string {
  const params = new URLSearchParams();

  if (trackId) {
    params.set("trackId", trackId);
  }

  if (trackSortField) {
    params.set("sort", `${trackSortField}-${trackSortDirection}`);
  }

  if (playlistSortField !== "title" || playlistSortDirection !== "asc") {
    params.set("playlistSort", `${playlistSortField}-${playlistSortDirection}`);
  }

  const path = buildPathForView(view);
  const query = params.toString();
  const relativeUrl = query ? `${path}?${query}` : path;
  return prependBasePath(relativeUrl);
}

function parseTrackSortParam(
  rawValue: string | null,
): {
  field: TrackSortField;
  direction: TrackSortDirection;
} {
  if (!rawValue) {
    return { field: null, direction: "asc" };
  }

  const [fieldPart, directionPart] = rawValue.split("-");
  const allowedFields: Array<Exclude<TrackSortField, null>> = [
    "title",
    "bpm",
    "key",
  ];

  const isValidField = (
    value: string,
  ): value is Exclude<TrackSortField, null> =>
    allowedFields.includes(value as Exclude<TrackSortField, null>);

  const field = isValidField(fieldPart) ? fieldPart : null;
  const direction: TrackSortDirection =
    directionPart === "desc" ? "desc" : "asc";

  return { field, direction };
}

function parsePlaylistSortParam(
  rawValue: string | null,
): {
  field: PlaylistSortField;
  direction: PlaylistSortDirection;
} {
  if (!rawValue) {
    return { field: "title", direction: "asc" };
  }

  const [fieldPart, directionPart] = rawValue.split("-");
  const allowedFields: PlaylistSortField[] = [
    "title",
    "createdAt",
    "updatedAt",
  ];

  const field = allowedFields.includes(fieldPart as PlaylistSortField)
    ? (fieldPart as PlaylistSortField)
    : "title";

  let direction: PlaylistSortDirection =
    directionPart === "desc" ? "desc" : "asc";

  if (!directionPart) {
    direction = field === "title" ? "asc" : "desc";
  }

  return { field, direction };
}

function parseViewFromPath(pathname: string): LibraryView | null {
  const normalized = pathname || "/";
  const hasTrailingSlash =
    normalized.length > 1 && normalized.endsWith("/");
  const segments = normalized.split("/").filter(Boolean);

  if (!segments.length) {
    return { type: "home" };
  }

  const [first, ...rest] = segments;

  if (first === "create") {
    return { type: "create" };
  }

  if (first !== "playlists") {
    return null;
  }

  if (!rest.length) {
    return { type: "playlists", folderPath: [] };
  }

  if (hasTrailingSlash) {
    return {
      type: "playlists",
      folderPath: rest.map(decodePathSegment),
    };
  }

  if (rest.length === 0) {
    return { type: "playlists", folderPath: [] };
  }

  const folderSegments = rest.slice(0, -1).map(decodePathSegment);
  const playlistSegment = rest[rest.length - 1];

  return {
    type: "playlistDetail",
    playlistId: decodePathSegment(playlistSegment),
    folderPath: folderSegments,
  };
}

function parseViewFromLegacyParams(
  viewParam: string | null,
  params: URLSearchParams,
): LibraryView {
  switch (viewParam) {
    case "playlists":
      return { type: "playlists", folderPath: [] };
    case "create":
      return { type: "create" };
    case "playlist": {
      const playlistId = params.get("playlistId");
      if (playlistId) {
        return { type: "playlistDetail", playlistId, folderPath: [] };
      }
      return { type: "playlists", folderPath: [] };
    }
    case "home":
    default:
      return { type: "home" };
  }
}

function buildPathForView(view: LibraryView): string {
  switch (view.type) {
    case "home":
      return "/";
    case "create":
      return "/create";
    case "playlists": {
      const encodedSegments = view.folderPath.map(encodePathSegment);
      const base = encodedSegments.length
        ? `/playlists/${encodedSegments.join("/")}`
        : "/playlists";
      return encodedSegments.length ? `${base}/` : base;
    }
    case "playlistDetail": {
      const folderSegments = view.folderPath.map(encodePathSegment);
      const base = folderSegments.length
        ? `/playlists/${folderSegments.join("/")}`
        : "/playlists";
      const playlistSegment = encodePathSegment(view.playlistId);
      return `${base}/${playlistSegment}`;
    }
    default:
      return "/";
  }
}

function stripBasePath(pathname: string): string {
  const normalizedPath = pathname || "/";
  if (!APP_BASE_PATH) {
    return normalizedPath;
  }
  if (normalizedPath === APP_BASE_PATH) {
    return "/";
  }
  const prefix = `${APP_BASE_PATH}/`;
  if (normalizedPath.startsWith(prefix)) {
    const remainder = normalizedPath.slice(APP_BASE_PATH.length);
    return remainder || "/";
  }
  return normalizedPath;
}

function prependBasePath(path: string): string {
  if (!APP_BASE_PATH) {
    return path;
  }
  if (path === "/") {
    return APP_BASE_PATH || "/";
  }
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default App;
