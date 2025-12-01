import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  addTrackToPlaylist as addTrackToPlaylistApi,
  fetchPlaylists,
  removeTrackFromPlaylist as removeTrackFromPlaylistApi,
  updatePlaylistMeta,
} from "@/data/playlists";
import type { Playlist } from "@/types/playlists";

export function usePlaylists() {
  const {
    data: fetchedPlaylists,
    refetch: refetchPlaylists,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: ({ signal }) => fetchPlaylists(signal),
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);

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

  const addTrackToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      let didAdd = false;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          if (playlist.trackIds.includes(trackId)) return playlist;
          didAdd = true;
          return { ...playlist, trackIds: [...playlist.trackIds, trackId] };
        }),
      );

      if (didAdd) {
        void addTrackToPlaylistApi(playlistId, trackId)
          .then((updated) => applyRemotePlaylistUpdate(updated))
          .catch((error) => {
            console.error("Failed to add track to playlist", error);
            void refetchPlaylists();
          });
      }
      return didAdd;
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      let didRemove = false;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          if (!playlist.trackIds.includes(trackId)) return playlist;
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

  const togglePlaylistPin = useCallback(
    (playlistId: string) => {
      let nextPinned: boolean | null = null;
      setPlaylists((previous) =>
        previous.map((playlist) => {
          if (playlist.id !== playlistId) return playlist;
          nextPinned = !playlist.isPinned;
          return { ...playlist, isPinned: nextPinned };
        }),
      );

      if (nextPinned === null) return;

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
          if (playlist.id !== playlistId) return playlist;
          nextFavorite = !playlist.isFavorite;
          return { ...playlist, isFavorite: nextFavorite };
        }),
      );

      if (nextFavorite === null) return;

      void updatePlaylistMeta(playlistId, { isFavorite: nextFavorite })
        .then((updated) => applyRemotePlaylistUpdate(updated))
        .catch((error) => {
          console.error("Failed to update playlist favorite state", error);
          void refetchPlaylists();
        });
    },
    [applyRemotePlaylistUpdate, refetchPlaylists],
  );

  return {
    data: playlists,
    setData: setPlaylists,
    refetch: refetchPlaylists,
    actions: {
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      togglePlaylistPin,
      togglePlaylistFavorite,
    },
  };
}
