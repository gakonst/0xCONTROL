import { useCallback, useEffect, useState } from "react";
import { useIsRestoring, useQuery } from "@tanstack/react-query";

import {
  addTrackToPlaylist as addTrackToPlaylistApi,
  createPlaylist as createPlaylistApi,
  deletePlaylist as deletePlaylistApi,
  fetchPlaylists,
  removeTrackFromPlaylist as removeTrackFromPlaylistApi,
  reorderPlaylistTracks as reorderPlaylistTracksApi,
  updatePlaylistMeta,
  type CreatePlaylistInput,
  type PlaylistMetaUpdates,
} from "@/data/playlists";
import type { Playlist } from "@/types/playlists";

export function usePlaylists() {
  const {
    data: fetchedPlaylists,
    refetch: refetchPlaylists,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: ({ signal }) => fetchPlaylists(signal),
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const isRestoring = useIsRestoring();

  useEffect(() => {
    if (Array.isArray(fetchedPlaylists)) {
      setPlaylists(fetchedPlaylists);
    }
  }, [fetchedPlaylists]);

  const applyRemotePlaylistUpdate = useCallback((updated: Playlist) => {
    if (!updated) return;
    setPlaylists((previous) => {
      const index = previous.findIndex((playlist) => playlist.id === updated.id);
      if (index === -1) return previous;
      const next = [...previous];
      next[index] = updated;
      return next;
    });
  }, []);

  const createPlaylist = useCallback(
    async (input: CreatePlaylistInput) => {
      try {
        const playlist = await createPlaylistApi(input);
        setPlaylists((previous) => [playlist, ...previous]);
        return playlist;
      } catch (error) {
        console.error("Failed to create playlist", error);
        void refetchPlaylists();
        return null;
      }
    },
    [refetchPlaylists],
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((previous) =>
        previous.filter((playlist) => playlist.id !== playlistId),
      );

      void deletePlaylistApi(playlistId).catch((error) => {
        console.error("Failed to delete playlist", error);
        void refetchPlaylists();
      });
    },
    [refetchPlaylists],
  );

  const addTrackToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      const target = playlists.find((playlist) => playlist.id === playlistId);
      if (!target || target.trackIds.includes(trackId)) return false;

      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          return { ...playlist, trackIds: [...playlist.trackIds, trackId] };
        }),
      );

      void addTrackToPlaylistApi(playlistId, trackId)
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to add track to playlist", error);
          void refetchPlaylists();
        });
      return true;
    },
    [applyRemotePlaylistUpdate, playlists, refetchPlaylists],
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      const target = playlists.find((playlist) => playlist.id === playlistId);
      if (!target || !target.trackIds.includes(trackId)) return false;

      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          return {
            ...playlist,
            trackIds: playlist.trackIds.filter((id) => id !== trackId),
          };
        }),
      );

      void removeTrackFromPlaylistApi(playlistId, trackId)
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to remove track from playlist", error);
          void refetchPlaylists();
        });

      return true;
    },
    [applyRemotePlaylistUpdate, playlists, refetchPlaylists],
  );

  const moveTrackInPlaylist = useCallback(
    (playlistId: string, trackId: string, direction: -1 | 1) => {
      const targetPlaylist = playlists.find(
        (playlist) => playlist.id === playlistId,
      );
      if (!targetPlaylist) return false;
      const index = targetPlaylist.trackIds.indexOf(trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= targetPlaylist.trackIds.length) {
        return false;
      }
      const nextTrackIds = [...targetPlaylist.trackIds];
      [nextTrackIds[index], nextTrackIds[target]] = [
        nextTrackIds[target],
        nextTrackIds[index],
      ];

      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          return { ...playlist, trackIds: nextTrackIds };
        }),
      );
      void reorderPlaylistTracksApi(playlistId, nextTrackIds)
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to reorder playlist", error);
          void refetchPlaylists();
        });
      return true;
    },
    [applyRemotePlaylistUpdate, playlists, refetchPlaylists],
  );

  const togglePlaylistPin = useCallback(
    (playlistId: string) => {
      const target = playlists.find((playlist) => playlist.id === playlistId);
      if (!target) return;
      const nextPinned = !target.isPinned;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          return { ...playlist, isPinned: nextPinned };
        }),
      );

      void updatePlaylistMeta(playlistId, { isPinned: nextPinned })
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to update playlist pin state", error);
          void refetchPlaylists();
        });
    },
    [applyRemotePlaylistUpdate, playlists, refetchPlaylists],
  );

  const togglePlaylistFavorite = useCallback(
    (playlistId: string) => {
      const target = playlists.find((playlist) => playlist.id === playlistId);
      if (!target) return;
      const nextFavorite = !target.isFavorite;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          return { ...playlist, isFavorite: nextFavorite };
        }),
      );

      void updatePlaylistMeta(playlistId, { isFavorite: nextFavorite })
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to update playlist favorite state", error);
          void refetchPlaylists();
        });
    },
    [applyRemotePlaylistUpdate, playlists, refetchPlaylists],
  );

  const updatePlaylist = useCallback(
    async (playlistId: string, updates: PlaylistMetaUpdates) => {
      setPlaylists((previous) =>
        previous.map((playlist) =>
          playlist.id === playlistId
            ? { ...playlist, ...updates, updatedAt: new Date().toISOString() }
            : playlist,
        ),
      );
      try {
        const updated = await updatePlaylistMeta(playlistId, updates);
        applyRemotePlaylistUpdate(updated);
        return updated;
      } catch (error) {
        console.error("Failed to update playlist", error);
        void refetchPlaylists();
        return null;
      }
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  return {
    data: playlists,
    setData: setPlaylists,
    refetch: refetchPlaylists,
    isLoading:
      !isError &&
      (isRestoring ||
        isLoading ||
        (playlists.length === 0 &&
          Array.isArray(fetchedPlaylists) &&
          fetchedPlaylists.length > 0)),
    actions: {
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      moveTrackInPlaylist,
      togglePlaylistPin,
      togglePlaylistFavorite,
      updatePlaylist,
      createPlaylist,
      deletePlaylist,
    },
  };
}
