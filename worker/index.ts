/// <reference types="@cloudflare/workers-types" />

import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

type AnnotationColor = "red" | "blue" | "pink" | "cyan";

interface TrackRecord {
  id: string;
  path: string;
  name: string;
  artist?: string;
  durationSeconds?: number;
  bpm?: number;
  key?: string;
  annotationColor?: AnnotationColor | null;
  annotationNote?: string | null;
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
  annotation_color: AnnotationColor | null;
  annotation_note: string | null;
}

type TrackAnnotationUpdatePayload = {
  color?: AnnotationColor | null;
  note?: string | null;
};

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

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type"],
  }),
);

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

app.patch("/api/tracks/:trackId/annotation", requireAuth, async (c) => {
  const trackId = c.req.param("trackId");
  if (!trackId) {
    return c.text("Track identifier is required", 400);
  }

  let payload: TrackAnnotationUpdatePayload | null = null;
  try {
    payload = (await c.req.json()) as TrackAnnotationUpdatePayload;
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  if (!payload) {
    return c.text("No annotation updates provided", 400);
  }

  const hasColorUpdate = Object.prototype.hasOwnProperty.call(payload, "color");
  const hasNoteUpdate = Object.prototype.hasOwnProperty.call(payload, "note");

  if (!hasColorUpdate && !hasNoteUpdate) {
    return c.text("No annotation updates provided", 400);
  }

  const setStatements: string[] = [];
  const parameters: Array<string | null> = [];

  let normalizedColor: AnnotationColor | null = null;
  if (hasColorUpdate) {
    const requestedColor = payload.color ?? null;
    if (requestedColor !== null && !isValidAnnotationColor(requestedColor)) {
      return c.text("Invalid annotation color", 400);
    }
    normalizedColor = requestedColor;
    setStatements.push("annotation_color = ?");
    parameters.push(normalizedColor);
  }

  let normalizedNote: string | null = null;
  if (hasNoteUpdate) {
    const requestedNote = payload.note ?? null;
    if (requestedNote !== null && typeof requestedNote !== "string") {
      return c.text("Invalid annotation note", 400);
    }
    normalizedNote = typeof requestedNote === "string" ? requestedNote : null;
    setStatements.push("annotation_note = ?");
    parameters.push(normalizedNote);
  }

  const statement = `
    UPDATE track_metadata
    SET ${setStatements.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE track_id = ?
  `;

  const result = await c.env.TRACKS_DB.prepare(statement)
    .bind(...parameters, trackId)
    .run();

  if (!result.success || result.changes === 0) {
    return c.text("Track not found", 404);
  }

  const responseBody: {
    annotation: {
      color?: AnnotationColor | null;
      note?: string | null;
    };
  } = { annotation: {} };

  if (hasColorUpdate) {
    responseBody.annotation.color = normalizedColor;
  }

  if (hasNoteUpdate) {
    responseBody.annotation.note = normalizedNote;
  }

  return c.json(responseBody);
});

const trackStreamHandler: MiddlewareHandler<WorkerContext> = async (c) => {
  const rawTrackId = c.req.param("trackId");
  const candidateKeys = buildTrackKeyCandidates(rawTrackId);

  if (candidateKeys.length === 0) {
    return c.text("Invalid track identifier", 400);
  }

  const rangeHeader = c.req.header("range");
  const requestedRange = parseHttpRange(rangeHeader);
  const getOptions = requestedRange ? { range: requestedRange } : undefined;

  try {
    let object: R2ObjectBody | null = null;

    for (const candidateKey of candidateKeys) {
      object = await c.env.TRACKS_BUCKET.get(candidateKey, getOptions);
      if (object) {
        break;
      }
    }

    if (!object) {
      return c.text("Track not found", 404);
    }

    const { headers, status } = buildTrackResponseHeaders(object, {
      isPartialRequest: Boolean(requestedRange),
    });

    return new Response(object.body, { headers, status });
  } catch (error) {
    console.error("Failed to load track from R2", error);
    return c.text("Unable to load track", 500);
  }
};

app.get("/api/tracks/:trackId", requireAuth, trackStreamHandler);

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
  try {
    const tracks = await loadCatalogFromDb(env.TRACKS_DB);
    return { tracks };
  } catch (error) {
    console.error("Failed to load catalog from D1", error);
    return { tracks: [] };
  }
}

async function loadCatalogFromDb(db: D1Database): Promise<TrackRecord[]> {
  const statement = `
    SELECT
      track_id,
      name,
      artist,
      duration_seconds,
      bpm,
      musical_key,
      annotation_color,
      annotation_note
    FROM track_metadata
    ORDER BY created_at DESC
  `;

  const query = db.prepare(statement);
  const { results } = await query.all<TrackMetadataRow>();

  return (results ?? []).map(convertMetadataRowToTrack);
}

function convertMetadataRowToTrack(row: TrackMetadataRow): TrackRecord {
  return {
    id: row.track_id,
    path: row.track_id,
    name: row.name,
    artist: row.artist,
    durationSeconds: row.duration_seconds ?? undefined,
    bpm: row.bpm ?? undefined,
    key: row.musical_key ?? undefined,
    annotationColor: row.annotation_color ?? null,
    annotationNote: row.annotation_note ?? null,
  };
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

function buildTrackKeyCandidates(rawTrackId?: string): string[] {
  if (!rawTrackId) {
    return [];
  }

  const decoded = safeDecodeURIComponent(rawTrackId);
  const keys = new Set<string>();

  if (decoded) {
    keys.add(decoded);
  }

  if (!decoded || decoded !== rawTrackId) {
    keys.add(rawTrackId);
  }

  return Array.from(keys);
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseHttpRange(rangeHeader?: string | null): R2Range | undefined {
  if (!rangeHeader) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return undefined;

  const startStr = match[1];
  const endStr = match[2];

  if (!startStr && !endStr) return undefined;

  if (startStr && endStr) {
    const start = Number(startStr);
    const end = Number(endStr);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      return undefined;
    }
    return { offset: start, length: end - start + 1 };
  }

  if (startStr) {
    const start = Number(startStr);
    if (Number.isNaN(start)) return undefined;
    return { offset: start };
  }

  const suffixLength = Number(endStr);
  if (Number.isNaN(suffixLength)) return undefined;
  return { suffix: suffixLength };
}

function buildTrackResponseHeaders(
  object: R2ObjectBody,
  options: { isPartialRequest: boolean },
): { headers: Headers; status: number } {
  const headers = new Headers();
  object.writeHttpMetadata(headers);

  const contentType =
    object.httpMetadata?.contentType ?? inferContentTypeFromKey(object.key);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");
  headers.set("Accept-Ranges", "bytes");

  const contentLength = object.range?.length ?? object.size;
  headers.set("Content-Length", contentLength.toString());

  let status = 200;

  if (options.isPartialRequest && object.range) {
    const offset =
      "offset" in object.range && typeof object.range.offset === "number"
        ? object.range.offset
        : Math.max(0, object.size - contentLength);
    const end = offset + contentLength - 1;
    headers.set("Content-Range", `bytes ${offset}-${end}/${object.size}`);
    status = 206;
  }

  return { headers, status };
}

function inferContentTypeFromKey(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

function isValidAnnotationColor(value: string): value is AnnotationColor {
  return value === "red" || value === "blue" || value === "pink" || value === "cyan";
}
