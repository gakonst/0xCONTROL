import { buildApiUrl } from "@/lib/api";
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
const SHOULD_USE_LOCAL_TRACKS =
  (import.meta.env.VITE_USE_LOCAL_TRACKS as string | undefined) === "true";
const LOCAL_TRACK_MANIFEST_PATH =
  (import.meta.env.VITE_LOCAL_TRACK_MANIFEST_PATH as string | undefined) ??
  "/tracks/manifest.json";
const R2_DEV_SERVER_URL =
  (import.meta.env.VITE_R2_DEV_SERVER_URL as string | undefined)?.replace(/\/$/, "");

type LocalTrackManifestEntry = {
  fileName?: string;
  name: string;
  version?: string;
  artist: string;
  durationSeconds?: number;
  bpm?: number;
  key?: string;
};

export async function fetchCatalogTracks(
  signal?: AbortSignal,
): Promise<Track[]> {
  const records = SHOULD_USE_LOCAL_TRACKS
    ? await loadLocalCatalogRecords(signal)
    : await loadRemoteCatalogRecords(signal);

  return records.map((record, index) =>
    convertCatalogRecordToTrack(record, index),
  );
}

async function loadRemoteCatalogRecords(
  signal?: AbortSignal,
): Promise<CatalogTrackRecord[]> {
  const catalogUrl = buildCatalogUrl();
  const response = await fetch(catalogUrl, { signal });

  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as CatalogResponse;
  return payload.tracks ?? [];
}

async function loadLocalCatalogRecords(
  signal?: AbortSignal,
): Promise<CatalogTrackRecord[]> {
  const response = await fetch(LOCAL_TRACK_MANIFEST_PATH, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Local catalog request failed with status ${response.status}`,
    );
  }

  const manifest = (await response.json()) as LocalTrackManifestEntry[];
  return manifest.map((entry, index) =>
    convertLocalManifestEntryToCatalogRecord(entry, index),
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

function convertLocalManifestEntryToCatalogRecord(
  entry: LocalTrackManifestEntry,
  index: number,
): CatalogTrackRecord {
  const normalizedFileName = entry.fileName?.trim();
  const identifier =
    normalizedFileName && normalizedFileName.length
      ? normalizedFileName
      : `local-track-${index}`;

  const resolvedName =
    entry.version && entry.version.length
      ? `${entry.name} - ${entry.version}`
      : entry.name;

  return {
    id: identifier,
    path: identifier,
    name: resolvedName,
    artist: entry.artist,
    durationSeconds: entry.durationSeconds ?? null,
    bpm: entry.bpm ?? null,
    key: entry.key ?? null,
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
  if (R2_DEV_SERVER_URL) {
    return `${R2_DEV_SERVER_URL}/${encodedId}`;
  }
  if (SHOULD_USE_LOCAL_TRACKS) {
    return `/tracks/${encodedId}`;
  }

  return buildApiUrl(`/api/tracks/${encodedId}`);
}
