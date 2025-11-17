import type { TrackAnnotation, TrackColor } from "@/types/annotations";

export type Track = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  duration: string;
  cover: string;
  annotation?: TrackAnnotation;
};

type CatalogTrackRecord = {
  id?: string;
  path?: string;
  name?: string;
  artist?: string;
  durationSeconds?: number | null;
  bpm?: number | null;
  key?: string | null;
  annotationColor?: TrackColor | null;
  annotationNote?: string | null;
};

type CatalogResponse = {
  tracks?: CatalogTrackRecord[];
};

const DEFAULT_COVER = "";
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function fetchCatalogTracks(
  signal?: AbortSignal,
): Promise<Track[]> {
  const catalogUrl = buildCatalogUrl();
  const response = await fetch(catalogUrl, { signal });

  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as CatalogResponse;
  const records = payload.tracks ?? [];

  return records.map((record, index) =>
    convertCatalogRecordToTrack(record, index),
  );
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
    cover: DEFAULT_COVER,
    annotation: buildAnnotationFromRecord(record),
  };
}

function buildAnnotationFromRecord(
  record: CatalogTrackRecord,
): TrackAnnotation | undefined {
  const annotation: TrackAnnotation = {};

  if (record.annotationColor) {
    annotation.color = record.annotationColor;
  }

  if (typeof record.annotationNote === "string" && record.annotationNote.length) {
    annotation.note = record.annotationNote;
  }

  return Object.keys(annotation).length ? annotation : undefined;
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

function buildCatalogUrl(): string {
  return buildApiUrl("/api/catalog");
}

export function getTrackUrl(trackId: string): string {
  const encodedId = encodeURIComponent(trackId);
  return buildApiUrl(`/api/tracks/${encodedId}`);
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) {
    return normalizedPath;
  }

  const trimmedBase = API_BASE_URL.replace(/\/+$/, "");
  return `${trimmedBase}${normalizedPath}`;
}
