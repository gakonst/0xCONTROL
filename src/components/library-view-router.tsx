import type { Dispatch, SetStateAction } from "react";

import { PlaylistBrowser } from "@/components/playlist-browser";
import { PlaylistCreatePanel } from "@/components/playlist-create-panel";
import {
  TrackList,
  type TrackSortDirection,
  type TrackSortField,
} from "@/components/track-list";
import type { LibraryView } from "@/lib/library-state";
import type { Track } from "@/data/tracks";
import type { Playlist } from "@/types/playlists";
import type { TrackAnnotation } from "@/types/annotations";
import type {
  PlaylistSortDirection,
  PlaylistSortField,
} from "@/components/playlist-browser";
import type { LibraryNavigationApi } from "@/hooks/use-library-navigation";

export type LibraryViewRouterProps = {
  navigation: LibraryNavigationApi;
  playlists: Playlist[];
  tracks: Track[];
  visibleTracks: Track[];
  activeTrackId: string;
  onTrackSelect: (track: Track) => void;
  onPlaylistSelect: (playlistId: string) => void;
  onPlaylistCreated?: (playlist: Playlist) => void;
  onFolderPathChange: Dispatch<SetStateAction<string[]>>;
  folderPath: string[];
  onTogglePin: (playlistId: string) => void;
  onToggleFavorite: (playlistId: string) => void;
  header?: {
    title: string;
    backLabel?: string;
    backDestinationLabel?: string;
    onBack: () => void;
    showFullBackRow?: boolean;
  };
  quickAddLabel?: string;
  onQuickAddToPlaylist?: (trackId: string) => boolean;
  quickRemoveLabel?: string;
  onQuickRemoveFromPlaylist?: (trackId: string) => boolean;
  annotations: Record<string, TrackAnnotation>;
  playback: {
    trackId: string;
    isPlaying: boolean;
    elapsedSeconds: number;
    durationSeconds?: number;
    liveTimeGetter?: () => number;
  };
};

export function LibraryViewRouter({
  navigation,
  playlists,
  tracks,
  visibleTracks,
  activeTrackId,
  onTrackSelect,
  onPlaylistSelect,
  onFolderPathChange,
  folderPath,
  onTogglePin,
  onToggleFavorite,
  onPlaylistCreated,
  header,
  quickAddLabel,
  onQuickAddToPlaylist,
  quickRemoveLabel,
  onQuickRemoveFromPlaylist,
  annotations,
  playback,
}: LibraryViewRouterProps) {
  const {
    route: { view },
    sort: {
      playlists: {
        field: playlistSortField,
        direction: playlistSortDirection,
        set: handlePlaylistSortChange,
        reset: handlePlaylistSortReset,
      },
      tracks: {
        field: trackSortField,
        direction: trackSortDirection,
        set: handleTrackSortChange,
        reset: handleTrackSortReset,
      },
    },
  } = navigation;

  const isPlaylists = view.type === "playlists";
  const isCreate = view.type === "create";

  return (
    <div className="relative h-full w-full">
      <div
        className={
          isPlaylists
            ? "absolute inset-0 h-full w-full opacity-100 transition-opacity"
            : "absolute inset-0 h-full w-full opacity-0 pointer-events-none transition-opacity"
        }
        aria-hidden={!isPlaylists}
      >
        <PlaylistBrowser
          playlists={playlists}
          tracks={tracks}
          onSelect={onPlaylistSelect}
          folderPath={folderPath}
          onFolderPathChange={onFolderPathChange}
          sortField={playlistSortField}
          sortDirection={playlistSortDirection}
          onSortChange={handlePlaylistSortChange}
          onSortReset={handlePlaylistSortReset}
          onTogglePin={onTogglePin}
          onToggleFavorite={onToggleFavorite}
        />
      </div>

      <div
        className={
          isCreate
            ? "absolute inset-0 h-full w-full opacity-100 transition-opacity"
            : "absolute inset-0 h-full w-full opacity-0 pointer-events-none transition-opacity"
        }
        aria-hidden={!isCreate}
      >
        <PlaylistCreatePanel onPlaylistCreated={onPlaylistCreated} />
      </div>

      <div
        className={
          !isPlaylists && !isCreate
            ? "absolute inset-0 h-full w-full opacity-100 transition-opacity"
            : "absolute inset-0 h-full w-full opacity-0 pointer-events-none transition-opacity"
        }
        aria-hidden={isPlaylists || isCreate}
      >
        <TrackList
          className="h-full w-full"
          tracks={visibleTracks}
          activeTrackId={activeTrackId}
          onSelect={onTrackSelect}
          header={header}
          sortField={trackSortField}
          sortDirection={trackSortDirection}
          onSortChange={handleTrackSortChange}
          onSortReset={handleTrackSortReset}
          quickAddLabel={quickAddLabel}
          onQuickAddToPlaylist={onQuickAddToPlaylist}
          quickRemoveLabel={quickRemoveLabel}
          onQuickRemoveFromPlaylist={onQuickRemoveFromPlaylist}
          annotations={annotations}
          playback={playback}
        />
      </div>
    </div>
  );
}
