import { useCallback, useMemo, useState } from "react";

import type { LibraryNavigationApi } from "@/hooks/use-library-navigation";
import type { Track } from "@/data/tracks";
import type { Playlist } from "@/types/playlists";
import type { TrackAnnotation } from "@/types/annotations";

export type LibraryActionsDeps = {
  navigation: LibraryNavigationApi;
  playlists: Playlist[];
  tracks: Track[];
  annotations: Record<string, TrackAnnotation>;
  playlistsActions: {
    addTrackToPlaylist: (playlistId: string, trackId: string) => boolean;
    removeTrackFromPlaylist: (playlistId: string, trackId: string) => boolean;
  };
  preferredPlaylistId: string | null;
  setPreferredPlaylistId: (id: string | null) => void;
  onTrackSelectedPlay?: (trackId: string) => void;
};

export function useLibraryActions({
  navigation,
  playlists,
  tracks,
  annotations,
  playlistsActions,
  preferredPlaylistId,
  setPreferredPlaylistId,
  onTrackSelectedPlay,
}: LibraryActionsDeps) {
  const [pendingQuickAddTrackId, setPendingQuickAddTrackId] = useState<string | null>(null);
  const [pendingQuickAddReturnView, setPendingQuickAddReturnView] = useState<LibraryNavigationApi["route"]["view"] | null>(null);
  const [isFullScreenPlayerOpen, setIsFullScreenPlayerOpen] = useState(false);

  const activePlaylist = useMemo(() => {
    const view = navigation.route.view;
    if (view.type !== "playlistDetail") return undefined;
    return playlists.find((p) => p.id === view.playlistId);
  }, [navigation.route.view, playlists]);

  const quickAddTargetPlaylist = useMemo(() => {
    if (navigation.route.view.type === "playlistDetail" && activePlaylist) return activePlaylist;

    if (preferredPlaylistId) {
      const found = playlists.find((p) => p.id === preferredPlaylistId);
      if (found) return found;
    }

    return null;
  }, [navigation.route.view, activePlaylist, preferredPlaylistId, playlists]);

  const visibleTracks = useMemo(() => {
    if (navigation.route.view.type === "playlistDetail" && activePlaylist) {
      const ids = new Set(activePlaylist.trackIds);
      return tracks.filter((t) => ids.has(t.id));
    }
    return tracks;
  }, [navigation.route.view, activePlaylist, tracks]);

  const handleTrackSelect = useCallback(
    (track: Track) => {
      onTrackSelectedPlay?.(track.id);
      navigation.route.setView((prev) => prev);
      setIsFullScreenPlayerOpen(false);
    },
    [navigation.route, onTrackSelectedPlay],
  );

  const handlePlaylistSelect = useCallback(
    (playlistId: string) => {
      setPreferredPlaylistId(playlistId);
      const target = playlists.find((p) => p.id === playlistId);
      const targetFolderPath = target?.folderPath ?? [];

      if (pendingQuickAddTrackId) {
        const trackId = pendingQuickAddTrackId;
        setPendingQuickAddTrackId(null);
        setPendingQuickAddReturnView(null);
        void playlistsActions.addTrackToPlaylist(playlistId, trackId);
        navigation.route.setView(pendingQuickAddReturnView ?? { type: "home" });
        return;
      }

      navigation.route.setView({
        type: "playlistDetail",
        playlistId,
        folderPath: targetFolderPath,
      });
    },
    [navigation.route, playlists, pendingQuickAddTrackId, pendingQuickAddReturnView, playlistsActions, setPreferredPlaylistId],
  );

  const handleQuickAddToPlaylist = useCallback(
    (trackId: string) => {
      if (quickAddTargetPlaylist) {
        return playlistsActions.addTrackToPlaylist(quickAddTargetPlaylist.id, trackId);
      }
      if (!playlists.length) return false;

      setPendingQuickAddTrackId(trackId);
      setPendingQuickAddReturnView(navigation.route.view);
      if (navigation.route.view.type !== "playlists") {
        const fallbackFolderPath =
          navigation.route.previousPrimaryView.type === "playlists"
            ? navigation.route.previousPrimaryView.folderPath
            : [];
        navigation.route.setView({ type: "playlists", folderPath: fallbackFolderPath });
      }
      return true;
    },
    [quickAddTargetPlaylist, playlists.length, navigation.route, playlistsActions],
  );

  const handleQuickRemoveFromPlaylist = useMemo(() => {
    if (navigation.route.view.type === "playlistDetail" && activePlaylist) {
      return (trackId: string) => playlistsActions.removeTrackFromPlaylist(activePlaylist.id, trackId);
    }
    return undefined;
  }, [navigation.route.view, activePlaylist, playlistsActions]);

  const trackListHeader = useMemo(() => {
    if (navigation.route.view.type !== "playlistDetail" || !activePlaylist) return undefined;
    const previousLevelLabel = navigation.route.previousPrimaryView.type === "home"
      ? "Home"
      : navigation.route.previousPrimaryView.type === "create"
        ? "Create"
        : navigation.route.previousPrimaryView.folderPath.length
          ? navigation.route.previousPrimaryView.folderPath.join(" / ")
          : "All playlists";
    return {
      title: activePlaylist.title,
      backLabel: "Up one level",
      backDestinationLabel: previousLevelLabel,
      onBack: navigation.route.exitPlaylistDetail,
      showFullBackRow: true,
    } as const;
  }, [navigation.route.view, activePlaylist, navigation.route.previousPrimaryView, navigation.route.exitPlaylistDetail]);

  return {
    state: {
      activePlaylist,
      quickAddTargetPlaylist,
      visibleTracks,
      pendingQuickAddTrackId,
      isFullScreenPlayerOpen,
      preferredPlaylistId,
    },
    setIsFullScreenPlayerOpen,
    handleTrackSelect,
    handlePlaylistSelect,
    handleQuickAddToPlaylist,
    handleQuickRemoveFromPlaylist,
    trackListHeader,
  };
}
