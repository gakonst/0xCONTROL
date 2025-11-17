/// <reference types="@cloudflare/workers-types" />

import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

interface TrackRecord {
  id: string;
  path: string;
  name: string;
  artist?: string;
  durationSeconds?: number;
  bpm?: number;
  key?: string;
}

interface CatalogResponse {
  tracks: TrackRecord[];
}

interface TrackMetadataRow {
  track_id: string;
  name: string;
  artist: string;
  duration_seconds: number | null;
  bpm: number | null;
  musical_key: string | null;
}

export interface Env {
  ASSETS: Fetcher;
  SONG_PASSWORD: string;
  TRACKS_BUCKET: R2Bucket;
  TRACKS_DB: D1Database;
}

const INDEX_PATH = "index.html";

type WorkerContext = { Bindings: Env };

const app = new Hono<WorkerContext>();

const requireAuth: MiddlewareHandler<WorkerContext> = async (c, next) => {
  const auth = await authenticateRequest(c);
  if (!auth) {
    return c.text("Unauthorized", 401);
  }

  await next();
};

async function authenticateRequest(_c: Parameters<typeof requireAuth>[0]) {
  // TODO: wire proper auth once we lock requirements.
  return true;
}

app.get("/api/tracks", requireAuth, async (c) => {
  const catalog = await buildCatalogResponse(c.env);
  return c.json(catalog, 200, {
    "Cache-Control": "no-store",
  });
});

app.get("/api/catalog", requireAuth, async (c) => {
  const catalog = await buildCatalogResponse(c.env);
  return c.json(catalog, 200, {
    "Cache-Control": "no-store",
  });
});

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const honoResponse = await app.fetch(request, env, ctx);
    if (honoResponse.status !== 404) {
      return honoResponse;
    }

    return serveAssets(request, env);
  },
} satisfies ExportedHandler<Env>;

async function buildCatalogResponse(env: Env): Promise<CatalogResponse> {
  const tracks = await listTracks(env.TRACKS_BUCKET);
  if (tracks.length === 0) {
    return { tracks };
  }

  let metadata = new Map<string, TrackMetadataRow>();

  try {
    metadata = await loadMetadataForTracks(
      env.TRACKS_DB,
      tracks.map((track) => track.id),
    );
  } catch (error) {
    console.error("Failed to load metadata from D1", error);
  }

  return {
    tracks: tracks.map((track) =>
      mergeTrackMetadata(track, metadata.get(track.id)),
    ),
  };
}

async function listTracks(bucket: R2Bucket): Promise<TrackRecord[]> {
  const records: TrackRecord[] = [];
  let cursor: string | undefined;

  do {
    const { objects, truncated, cursor: nextCursor } = await bucket.list({
      cursor,
    });

    for (const object of objects) {
      records.push(convertObjectToTrack(object));
    }

    cursor = truncated ? nextCursor : undefined;
  } while (cursor);

  return records;
}

async function loadMetadataForTracks(
  db: D1Database,
  trackIds: string[],
): Promise<Map<string, TrackMetadataRow>> {
  const metadata = new Map<string, TrackMetadataRow>();

  if (trackIds.length === 0) {
    return metadata;
  }

  const placeholders = trackIds
    .map((_, index) => `?${index + 1}`)
    .join(", ");
  const statement = `
    SELECT
      track_id,
      name,
      artist,
      duration_seconds,
      bpm,
      musical_key
    FROM track_metadata
    WHERE track_id IN (${placeholders})
  `;

  const query = db.prepare(statement).bind(...trackIds);
  const { results } = await query.all<TrackMetadataRow>();

  for (const row of results ?? []) {
    metadata.set(row.track_id, row);
  }

  return metadata;
}

function mergeTrackMetadata(
  track: TrackRecord,
  metadata: TrackMetadataRow | undefined,
): TrackRecord {
  if (!metadata) {
    return track;
  }

  return {
    ...track,
    name: metadata.name ?? track.name,
    artist: metadata.artist ?? track.artist,
    durationSeconds:
      metadata.duration_seconds ?? track.durationSeconds,
    bpm: metadata.bpm ?? track.bpm,
    key: metadata.musical_key ?? track.key,
  };
}

function convertObjectToTrack(object: R2Object): TrackRecord {
  const leafName = object.key.split("/").pop() ?? object.key;
  const friendlyName = decodeMaybe(leafName);

  return {
    id: object.key,
    name: friendlyName,
    path: object.key,
  };
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function serveAssets(request: Request, env: Env): Promise<Response> {
  const assetResponse = await env.ASSETS.fetch(request);

  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const url = new URL(request.url);

  if (request.method === "GET" && shouldServeSPA(url)) {
    const indexUrl = new URL(`/${INDEX_PATH}`, url.origin);
    const indexRequest = new Request(indexUrl.toString(), request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (indexResponse.status < 400) {
      return indexResponse;
    }
  }

  return assetResponse;
}

function shouldServeSPA(url: URL): boolean {
  return !url.pathname.split("/").at(-1)?.includes(".");
}
