import type { Dispatch, ReactNode, SetStateAction } from "react";

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
import { cn } from "@/lib/utils";

type LayerProps = {
  active: boolean;
  children: ReactNode;
  ariaHidden: boolean;
};

function Layer({ active, children, ariaHidden }: LayerProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full transition-opacity duration-150",
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-hidden={ariaHidden}
    >
      {children}
    </div>
  );
}

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
  onDeletePlaylist: (playlistId: string) => void;
  header?: {
    title: string;
    backLabel?: string;
    backDestinationLabel?: string;
    onBack: () => void;
    showFullBackRow?: boolean;
  };
  quickAddLabel?: string;
  onQuickAddToPlaylist?: (trackId: string) => boolean;
  quickArchiveLabel?: string;
  onQuickArchiveToPlaylist?: (trackId: string) => boolean;
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
  onDeletePlaylist,
  onPlaylistCreated,
  header,
  quickAddLabel,
  onQuickAddToPlaylist,
  quickArchiveLabel,
  onQuickArchiveToPlaylist,
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
  const isTracks = !isPlaylists && !isCreate;

  return (
    <div className="relative h-full w-full">
      <Layer active={isPlaylists} ariaHidden={!isPlaylists}>
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
          onDeletePlaylist={onDeletePlaylist}
        />
      </Layer>

      <Layer active={isCreate} ariaHidden={!isCreate}>
        <PlaylistCreatePanel onPlaylistCreated={onPlaylistCreated} />
      </Layer>

      <Layer active={isTracks} ariaHidden={!isTracks}>
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
          quickArchiveLabel={quickArchiveLabel}
          onQuickArchiveToPlaylist={onQuickArchiveToPlaylist}
          quickRemoveLabel={quickRemoveLabel}
          onQuickRemoveFromPlaylist={onQuickRemoveFromPlaylist}
          annotations={annotations}
          emptyState={
            view.type === "home"
              ? {
                  title: "No unassigned tracks",
                  description:
                    "Every track already lives in a playlist. Remove one from a playlist or make a new one to see it here.",
                }
              : undefined
          }
          playback={playback}
        />
      </Layer>
    </div>
  );
}
