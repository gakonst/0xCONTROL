export type Track = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  duration: string;
};

export type TrackLoadState = "idle" | "loading" | "ready" | "error";

type CatalogTrackRecord = {
  id?: string;
  path?: string;
  name?: string;
  artist?: string;
  durationSeconds?: number | null;
  bpm?: number | null;
  key?: string | null;
};

type CatalogResponse = {
  tracks?: CatalogTrackRecord[];
};

const DEFAULT_API_BASE_URL = "http://localhost:8787";

function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_API_BASE_URL
  );
}

function formatDurationFromSeconds(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return "0:00";
  }

  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function convertCatalogRecordToTrack(
  record: CatalogTrackRecord,
  index: number,
): Track {
  const identifier = record.id ?? record.path ?? `track-${index}`;

  return {
    id: identifier,
    title: record.name?.trim() || "Untitled Track",
    artist: record.artist?.trim() || "Unknown Artist",
    bpm: record.bpm ?? 0,
    key: record.key?.toUpperCase() || "--",
    duration: formatDurationFromSeconds(record.durationSeconds),
  };
}

export async function fetchCatalogTracks(): Promise<Track[]> {
  const url = `${getApiBaseUrl()}/api/catalog`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as CatalogResponse;
  return (payload.tracks ?? []).map(convertCatalogRecordToTrack);
}
