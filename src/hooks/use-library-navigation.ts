import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  buildUrlWithState,
  getInitialUrlState,
  parseUrlStateFromLocation,
  type LibraryView,
  type ParsedUrlState,
  type PrimaryLibraryView,
} from "@/lib/library-state";
import type { LibraryTabKey } from "@/components/library-tabs";
import type {
  PlaylistSortDirection,
  PlaylistSortField,
} from "@/components/playlist-browser";
import type {
  TrackSortDirection,
  TrackSortField,
} from "@/components/track-list";

type UseLibraryNavigationOptions = {
  initialState?: ParsedUrlState;
  currentTrackId: string;
  onTrackIdChange: (trackId: string) => void;
};

type FolderPathSetter = Dispatch<SetStateAction<string[]>>;

export type LibraryNavigationApi = {
  route: {
    view: LibraryView;
    setView: Dispatch<SetStateAction<LibraryView>>;
    previousPrimaryView: PrimaryLibraryView;
    exitPlaylistDetail: () => void;
    folderPath: string[];
    setFolderPath: FolderPathSetter;
  };
  sort: {
    tracks: {
      field: TrackSortField;
      direction: TrackSortDirection;
      set: (field: TrackSortField, direction: TrackSortDirection) => void;
      reset: () => void;
    };
    playlists: {
      field: PlaylistSortField;
      direction: PlaylistSortDirection;
      set: (
        field: PlaylistSortField,
        direction: PlaylistSortDirection,
      ) => void;
      reset: () => void;
    };
  };
  tabs: {
    active: LibraryTabKey;
    set: (tab: LibraryTabKey) => void;
  };
};

export function useLibraryNavigation({
  initialState,
  currentTrackId,
  onTrackIdChange,
}: UseLibraryNavigationOptions): LibraryNavigationApi {
  const parsedInitialState = initialState ?? getInitialUrlState();
  const initialPrimaryView: PrimaryLibraryView =
    parsedInitialState.view.type === "playlistDetail"
      ? { type: "playlists", folderPath: parsedInitialState.view.folderPath }
      : parsedInitialState.view.type === "playlists"
        ? parsedInitialState.view
        : parsedInitialState.view;

  const [libraryView, setLibraryView] = useState<LibraryView>(
    parsedInitialState.view,
  );
  const [previousPrimaryView, setPreviousPrimaryView] =
    useState<PrimaryLibraryView>(initialPrimaryView);
  const [trackSortField, setTrackSortField] = useState<TrackSortField>(
    parsedInitialState.trackSortField,
  );
  const [trackSortDirection, setTrackSortDirection] =
    useState<TrackSortDirection>(parsedInitialState.trackSortDirection);
  const [playlistSortField, setPlaylistSortField] =
    useState<PlaylistSortField>(parsedInitialState.playlistSortField);
  const [playlistSortDirection, setPlaylistSortDirection] =
    useState<PlaylistSortDirection>(parsedInitialState.playlistSortDirection);

  const lastSyncedUrlRef = useRef(parsedInitialState.href);
  const isHandlingPopStateRef = useRef(false);
  const hasSyncedOnceRef = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      isHandlingPopStateRef.current = true;
      const parsed = parseUrlStateFromLocation(window.location);
      lastSyncedUrlRef.current =
        window.location.pathname + window.location.search;
      setLibraryView(parsed.view);
      onTrackIdChange(parsed.trackId ?? "");
      setTrackSortField(parsed.trackSortField);
      setTrackSortDirection(parsed.trackSortDirection);
      setPlaylistSortField(parsed.playlistSortField);
      setPlaylistSortDirection(parsed.playlistSortDirection);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onTrackIdChange]);

  useEffect(() => {
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

  useEffect(() => {
    if (libraryView.type === "playlistDetail") {
      return;
    }
    setPreviousPrimaryView(libraryView);
  }, [libraryView]);

  const handleFolderPathChange = useCallback<FolderPathSetter>((nextPath) => {
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

  const handleExitPlaylistDetail = useCallback(() => {
    setLibraryView(previousPrimaryView);
  }, [previousPrimaryView]);

  const activeTab: LibraryTabKey = useMemo(() => {
    if (libraryView.type === "create") return "create";
    if (libraryView.type === "home") return "home";
    return "playlists";
  }, [libraryView]);

  return {
    route: {
      view: libraryView,
      setView: setLibraryView,
      previousPrimaryView,
      exitPlaylistDetail: handleExitPlaylistDetail,
      folderPath:
        libraryView.type === "playlists"
          ? libraryView.folderPath
          : libraryView.type === "playlistDetail"
            ? libraryView.folderPath
            : [],
      setFolderPath: handleFolderPathChange,
    },
    sort: {
      tracks: {
        field: trackSortField,
        direction: trackSortDirection,
        set: handleTrackSortChange,
        reset: handleTrackSortReset,
      },
      playlists: {
        field: playlistSortField,
        direction: playlistSortDirection,
        set: handlePlaylistSortChange,
        reset: handlePlaylistSortReset,
      },
    },
    tabs: {
      active: activeTab,
      set: handleTabChange,
    },
  };
}
