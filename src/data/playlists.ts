import { buildApiUrl } from "@/lib/api";
import type { Playlist } from "@/types/playlists";

type ApiPlaylist = {
  id: string;
  title: string;
  description: string;
  mood: string;
  tags?: string[] | null;
  accentFrom?: string | null;
  accentTo?: string | null;
  cover?: string | null;
  folderPath?: string[] | null;
  isPinned?: boolean;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  trackIds: string[];
};

type PlaylistsResponse = {
  playlists: ApiPlaylist[];
};

type PlaylistResponse = {
  playlist: ApiPlaylist;
};

type PlaylistMetaUpdates = {
  isPinned?: boolean;
  isFavorite?: boolean;
};

export async function fetchPlaylists(
  signal?: AbortSignal,
): Promise<Playlist[]> {
  const response = await fetch(buildApiUrl("/api/playlists"), {
    method: "GET",
    signal,
    headers: {
      "Cache-Control": "no-store",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load playlists (status ${response.status})`);
  }

  const payload = (await response.json()) as PlaylistsResponse;
  return (payload.playlists ?? []).map(normalizePlaylist);
}

export async function updatePlaylistMeta(
  playlistId: string,
  updates: PlaylistMetaUpdates,
): Promise<Playlist> {
  const response = await fetch(
    buildApiUrl(`/api/playlists/${encodeURIComponent(playlistId)}`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to update playlist (status ${response.status})`,
    );
  }

  const payload = (await response.json()) as PlaylistResponse;
  return normalizePlaylist(payload.playlist);
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<Playlist> {
  const response = await fetch(
    buildApiUrl(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackId }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to add track to playlist (status ${response.status})`,
    );
  }

  const payload = (await response.json()) as PlaylistResponse;
  return normalizePlaylist(payload.playlist);
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): Promise<Playlist> {
  const response = await fetch(
    buildApiUrl(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`,
    ),
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to remove track from playlist (status ${response.status})`,
    );
  }

  const payload = (await response.json()) as PlaylistResponse;
  return normalizePlaylist(payload.playlist);
}

function normalizePlaylist(record: ApiPlaylist): Playlist {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    mood: record.mood,
    tags: Array.isArray(record.tags) ? record.tags : undefined,
    accentFrom: record.accentFrom ?? undefined,
    accentTo: record.accentTo ?? undefined,
    cover: record.cover ?? undefined,
    folderPath: Array.isArray(record.folderPath) ? record.folderPath : [],
    trackIds: record.trackIds ?? [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isPinned: Boolean(record.isPinned),
    isFavorite: Boolean(record.isFavorite),
  };
}
