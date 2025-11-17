import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlayerBar } from "@/components/player-bar";
import { FullScreenPlayer } from "@/components/fullscreen-player";
import { TrackList } from "@/components/track-list";
import { TrackNotesEditor } from "@/components/track-notes-editor";
import { PlaylistBrowser } from "@/components/playlist-browser";
import { PlaylistCreatePanel } from "@/components/playlist-create-panel";
import { LibraryTabs, type LibraryTabKey } from "@/components/library-tabs";
import { updateTrackAnnotation } from "@/data/annotations";
import { buildMockPlaylists } from "@/data/playlists";
import { fetchCatalogTracks, getTrackUrl, type Track } from "@/data/tracks";
import { useMediaSession } from "@/hooks/use-media-session";
import type { TrackAnnotation } from "@/types/annotations";
import type { Playlist } from "@/types/playlists";

type LibraryView =
  | { type: "home" }
  | { type: "playlists" }
  | { type: "playlistDetail"; playlistId: string }
  | { type: "create" };

function App() {
  const [currentTrackId, setCurrentTrackId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [isFullScreenPlayerOpen, setIsFullScreenPlayerOpen] = useState(false);
  const [annotations, setAnnotations] = useState<
    Record<string, TrackAnnotation>
  >({});
  const [libraryView, setLibraryView] = useState<LibraryView>({ type: "home" });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackUrlRef = useRef<string>("");
  const pendingNoteSavesRef = useRef(
    new Map<
      string,
      { timeoutId: ReturnType<typeof setTimeout>; note: string }
    >(),
  );

  const { data: tracks = [] } = useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => fetchCatalogTracks(signal),
  });

  const playlists = useMemo<Playlist[]>(() => {
    return buildMockPlaylists(tracks);
  }, [tracks]);

  const activePlaylist =
    libraryView.type === "playlistDetail"
      ? playlists.find((playlist) => playlist.id === libraryView.playlistId)
      : undefined;

  useEffect(() => {
    if (libraryView.type === "playlistDetail" && !activePlaylist) {
      setLibraryView({ type: "playlists" });
    }
  }, [libraryView, activePlaylist]);

  const visibleTracks = useMemo(() => {
    if (libraryView.type === "playlistDetail" && activePlaylist) {
      const playlistTrackIds = new Set(activePlaylist.trackIds);
      return tracks.filter((track) => playlistTrackIds.has(track.id));
    }
    return tracks;
  }, [tracks, libraryView, activePlaylist]);

  const trackListHeader =
    libraryView.type === "playlistDetail" && activePlaylist
      ? {
          title: activePlaylist.title,
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
      if (currentTrackId !== "") {
        setCurrentTrackId("");
      }
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

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

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

  const handlePlaylistSelect = useCallback((playlistId: string) => {
    setLibraryView({ type: "playlistDetail", playlistId });
  }, []);

  const handleTabChange = useCallback((tab: LibraryTabKey) => {
    if (tab === "home") {
      setLibraryView({ type: "home" });
      return;
    }
    if (tab === "playlists") {
      setLibraryView({ type: "playlists" });
      return;
    }
    setLibraryView({ type: "create" });
  }, []);

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
            />
          ) : libraryView.type === "create" ? (
            <PlaylistCreatePanel />
          ) : (
            <TrackList
              className="h-full w-full"
              tracks={visibleTracks}
              activeTrackId={currentTrack?.id ?? ""}
              onSelect={handleTrackSelect}
              header={trackListHeader}
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
            durationSeconds={durationSeconds ?? undefined}
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
          durationSeconds={durationSeconds ?? undefined}
          onTogglePlay={handleTogglePlay}
          onSkipNext={goToNextTrack}
          onSkipPrevious={goToPreviousTrack}
          onClose={() => setIsFullScreenPlayerOpen(false)}
          onSeek={handleSeek}
        />
      )}
    </div>
  );
}

export default App;
