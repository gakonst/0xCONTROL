import type { TrackSortDirection, TrackSortField } from "@/components/track-list";
import type { PlaylistSortDirection, PlaylistSortField } from "@/components/playlist-browser";

export type PlaylistsView = { type: "playlists"; folderPath: string[] };
export type PlaylistDetailView = {
  type: "playlistDetail";
  playlistId: string;
  folderPath: string[];
};

export type LibraryView =
  | { type: "home" }
  | PlaylistsView
  | PlaylistDetailView
  | { type: "create" };

export type PrimaryLibraryView =
  | { type: "home" }
  | PlaylistsView
  | { type: "create" };

export type ParsedUrlState = {
  view: LibraryView;
  trackId?: string;
  href: string;
  pathname: string;
  trackSortField: TrackSortField;
  trackSortDirection: TrackSortDirection;
  playlistSortField: PlaylistSortField;
  playlistSortDirection: PlaylistSortDirection;
};

const RAW_APP_BASE_PATH = (import.meta.env.BASE_URL ?? "/") as string;
export const APP_BASE_PATH =
  RAW_APP_BASE_PATH === "/" ? "" : RAW_APP_BASE_PATH.replace(/\/+$/, "");

export function getInitialUrlState(): ParsedUrlState {
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

export function parseUrlStateFromLocation(location: Location): ParsedUrlState {
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

export function buildUrlWithState(
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

export function parseTrackSortParam(
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

export function parsePlaylistSortParam(
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

export function parseViewFromPath(pathname: string): LibraryView | null {
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

export function parseViewFromLegacyParams(
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

export function buildPathForView(view: LibraryView): string {
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

export function stripBasePath(pathname: string): string {
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

export function prependBasePath(path: string): string {
  if (!APP_BASE_PATH) {
    return path;
  }
  if (path === "/") {
    return APP_BASE_PATH || "/";
  }
  return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
