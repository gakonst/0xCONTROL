import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FullScreenPlayer } from "@/components/fullscreen-player";
import { LibraryFooter } from "@/components/library-footer";
import { LibraryViewRouter } from "@/components/library-view-router";
import { useMediaSession } from "@/hooks/use-media-session";
import { useWaveform } from "@/hooks/use-waveform";
import {
  useLibraryNavigation,
  type LibraryNavigationApi,
} from "@/hooks/use-library-navigation";
import { usePlaybackApi } from "@/hooks/use-playback-api";
import { usePlaylists } from "@/hooks/use-playlists";
import { useAnnotationsApi } from "@/hooks/use-annotations-api";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useLibraryActions } from "@/hooks/use-library-actions";
import { AppShell } from "@/components/app-shell";
import { fetchCatalogTracks, type Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";
import type { Playlist } from "@/types/playlists";
import { getInitialUrlState, type LibraryView } from "@/lib/library-state";

function App() {
  const initialUrlState = getInitialUrlState();

  const { data: fetchedTracks } = useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => fetchCatalogTracks(signal),
  });
  const tracks = fetchedTracks ?? [];

  const playbackApi = usePlaybackApi(tracks, initialUrlState.trackId);

  const navigation = useLibraryNavigation({
    initialState: initialUrlState,
    currentTrackId: playbackApi.state.currentTrackId,
    onTrackIdChange: playbackApi.setCurrentTrackId,
  });
  const currentView = navigation.route.view;

  const playlistsApi = usePlaylists();
  const playlists = playlistsApi.data;
  const setPlaylists = playlistsApi.setData;
  const { togglePlaylistPin, deletePlaylist } = playlistsApi.actions;
  const [preferredPlaylistId, setPreferredPlaylistId] = useState<string | null>(
    null,
  );
  const annotationsApi = useAnnotationsApi(tracks);
  const annotations = annotationsApi.state;

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

  const handlePlaylistCreated = useCallback(
    (playlist: Playlist) => {
      setPlaylists((previous) => [playlist, ...previous]);
      setPreferredPlaylistId(playlist.id);
      navigation.route.setView({
        type: "playlistDetail",
        playlistId: playlist.id,
        folderPath: playlist.folderPath ?? [],
      });
    },
    [navigation.route],
  );

  useEffect(() => {
    if (currentView.type !== "playlistDetail") {
      return;
    }
    if (!playlists.length) {
      return;
    }
    const exists = playlists.some((playlist) => {
      if (currentView.type !== "playlistDetail") return false;
      return playlist.id === currentView.playlistId;
    });
    if (!exists) {
      navigation.route.setView({
        type: "playlists",
        folderPath: currentView.folderPath,
      });
    }
  }, [currentView, playlists, navigation.route]);

  const libraryActions = useLibraryActions({
    navigation,
    playlists,
    tracks,
    annotations,
    playlistsActions: playlistsApi.actions,
    setPreferredPlaylistId,
    preferredPlaylistId,
    onTrackSelectedPlay: (trackId) => {
      playbackApi.setCurrentTrackId(trackId);
      playbackApi.controls.play();
    },
  });

  const {
    state: {
      activePlaylist,
      quickAddTargetPlaylist,
      visibleTracks,
      isFullScreenPlayerOpen,
    },
    setIsFullScreenPlayerOpen,
    handleTrackSelect,
    handlePlaylistSelect,
    handleQuickAddToPlaylist,
    handleQuickArchiveToPlaylist,
    handleQuickRemoveFromPlaylist,
    trackListHeader,
  } = libraryActions;

  const currentTrack = playbackApi.state.currentTrack ?? tracks[0];
  const currentAnnotation = currentTrack
    ? annotations[currentTrack.id]
    : undefined;

  const { data: currentWaveformAnalysis } = useWaveform(currentTrack?.id);
  const preferredDurationSeconds = currentWaveformAnalysis?.waveform?.durationSeconds;

  const handleCurrentAnnotationChange = useCallback(
    (partial: Partial<TrackAnnotation>) => {
      if (!currentTrack) return;
      annotationsApi.update(currentTrack.id, partial);
    },
    [currentTrack, annotationsApi],
  );

  const handleOpenFullScreen = useCallback(() => {
    setIsFullScreenPlayerOpen(true);
  }, [setIsFullScreenPlayerOpen]);

  useMediaSession({
    track: currentTrack,
    isPlaying: playbackApi.state.isPlaying,
    elapsedSeconds: playbackApi.state.elapsedSeconds,
    durationSeconds: playbackApi.state.durationSeconds,
    onPlayRequest: playbackApi.controls.play,
    onPauseRequest: playbackApi.controls.pause,
    onSkipNext: playbackApi.controls.next,
    onSkipPrevious: playbackApi.controls.previous,
    onSeekBackward: playbackApi.controls.seekBackward,
    onSeekForward: playbackApi.controls.seekForward,
    onSeekTo: (position) => playbackApi.controls.seek(position ?? 0),
  });

  useKeyboardShortcuts({
    enabled: true,
    hasTrack: Boolean(currentTrack || playbackApi.state.currentTrackId),
    onTogglePlay: playbackApi.controls.togglePlay,
  });

  useEffect(() => () => {
    annotationsApi.flush();
  }, [annotationsApi]);

  const footer = currentTrack ? (
    <LibraryFooter
      track={currentTrack}
      annotation={currentAnnotation}
      onAnnotationChange={handleCurrentAnnotationChange}
      isPlaying={playbackApi.state.isPlaying}
      isBuffering={playbackApi.state.isBuffering}
      elapsedSeconds={playbackApi.state.elapsedSeconds}
      durationSeconds={preferredDurationSeconds ?? undefined}
      bpmOverride={currentWaveformAnalysis?.bpm ?? null}
      waveform={currentWaveformAnalysis?.waveform ?? null}
      beatOffsetSeconds={currentWaveformAnalysis?.beatOffsetSeconds ?? null}
      liveTimeGetter={playbackApi.liveTimeGetter}
      onTogglePlay={playbackApi.controls.togglePlay}
      onSkipNext={playbackApi.controls.next}
      onSkipPrevious={playbackApi.controls.previous}
      onOpenFullScreen={handleOpenFullScreen}
      activeTab={navigation.tabs.active}
      onTabChange={navigation.tabs.set}
    />
  ) : null;

  const folderPath = navigation.route.folderPath;

  return (
    <AppShell footer={footer}>
      <div className="flex h-full min-h-full flex-col gap-4 px-4 pb-4">
        <LibraryViewRouter
          navigation={navigation}
          playlists={playlists}
          tracks={tracks}
          visibleTracks={visibleTracks}
          activeTrackId={currentTrack?.id ?? ""}
          onTrackSelect={handleTrackSelect}
          onPlaylistSelect={handlePlaylistSelect}
          onPlaylistCreated={handlePlaylistCreated}
          onFolderPathChange={navigation.route.setFolderPath}
          folderPath={folderPath}
          onTogglePin={togglePlaylistPin}
          onDeletePlaylist={deletePlaylist}
          header={trackListHeader}
          quickAddLabel={quickAddTargetPlaylist?.title}
          onQuickAddToPlaylist={handleQuickAddToPlaylist}
          quickArchiveLabel={currentView.type === "home" ? "Archive" : undefined}
          onQuickArchiveToPlaylist={
            currentView.type === "home" ? handleQuickArchiveToPlaylist : undefined
          }
          quickRemoveLabel={
            currentView.type === "playlistDetail" && activePlaylist
              ? activePlaylist.title
              : undefined
          }
          onQuickRemoveFromPlaylist={
            currentView.type === "playlistDetail"
              ? handleQuickRemoveFromPlaylist
              : undefined
          }
          annotations={annotations}
          playback={{
            trackId: currentTrack?.id ?? "",
            isPlaying: playbackApi.state.isPlaying,
            elapsedSeconds: playbackApi.state.elapsedSeconds,
            durationSeconds: preferredDurationSeconds ?? undefined,
            liveTimeGetter: playbackApi.liveTimeGetter,
          }}
        />
      </div>

      {isFullScreenPlayerOpen && currentTrack && (
        <FullScreenPlayer
          track={currentTrack}
          isPlaying={playbackApi.state.isPlaying}
          isBuffering={playbackApi.state.isBuffering}
          elapsedSeconds={playbackApi.state.elapsedSeconds}
          durationSeconds={preferredDurationSeconds ?? undefined}
          waveform={currentWaveformAnalysis?.waveform ?? null}
          waveformBpm={currentWaveformAnalysis?.bpm ?? null}
          beatOffsetSeconds={currentWaveformAnalysis?.beatOffsetSeconds ?? null}
          liveTimeGetter={playbackApi.liveTimeGetter}
          onTogglePlay={playbackApi.controls.togglePlay}
          onSkipNext={playbackApi.controls.next}
          onSkipPrevious={playbackApi.controls.previous}
          onClose={() => setIsFullScreenPlayerOpen(false)}
          onSeek={playbackApi.controls.seek}
          annotation={currentAnnotation}
          onAnnotationChange={handleCurrentAnnotationChange}
          activeTab={navigation.tabs.active}
          onTabChange={(tab) => {
            navigation.tabs.set(tab);
            setIsFullScreenPlayerOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}

export default App;
