/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer, type ContainerNamespace } from "@cloudflare/containers";
import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { PresetKey } from "../src/lib/waveform";

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

interface PlaylistRow {
  id: string;
  title: string;
  description: string;
  mood: string;
  tags: string | null;
  accent_from: string | null;
  accent_to: string | null;
  cover: string | null;
  folder_path: string | null;
  is_pinned: number | null;
  is_favorite: number | null;
  created_at: string;
  updated_at: string;
}

interface PlaylistTrackRow {
  playlist_id: string;
  track_id: string;
  position: number;
}

interface PlaylistRecord {
  id: string;
  title: string;
  description: string;
  mood: string;
  tags: string[];
  accentFrom?: string;
  accentTo?: string;
  cover?: string;
  folderPath: string[];
  isPinned: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  trackIds: string[];
}

type PlaylistMetaUpdatePayload = {
  isPinned?: boolean;
  isFavorite?: boolean;
};

type PlaylistTrackInput = {
  trackId?: string;
  position?: number;
};

type PlaylistCreatePayload = {
  title?: string;
  description?: string;
  mood?: string;
  tags?: string[];
  folderPath?: string[];
  accentFrom?: string | null;
  accentTo?: string | null;
  cover?: string | null;
  isPinned?: boolean;
  isFavorite?: boolean;
};

type AnalyzeRequestPayload = {
  trackId?: string;
  path?: string;
  resolution?: number;
  preset?: PresetKey;
};

export class AnalyzerContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
}

export interface Env {
  ASSETS: Fetcher;
  SONG_PASSWORD: string;
  TRACKS_BUCKET: R2Bucket;
  TRACKS_DB: D1Database;
  ANALYZER_CONTAINER: ContainerNamespace;
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
    allowMethods: ["GET", "OPTIONS", "PATCH", "POST", "DELETE"],
    allowHeaders: ["Content-Type", "Cache-Control"],
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

app.post("/api/analyze", requireAuth, async (c) => {
  let payload: AnalyzeRequestPayload | null = null;
  try {
    payload = (await c.req.json()) as AnalyzeRequestPayload;
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  const rawTrackId = typeof payload?.path === "string" ? payload.path : payload?.trackId;
  const candidateKeys = buildTrackKeyCandidates(rawTrackId);
  if (candidateKeys.length === 0) {
    return c.text("trackId or path is required", 400);
  }

  let object: R2ObjectBody | null = null;
  for (const candidateKey of candidateKeys) {
    object = await c.env.TRACKS_BUCKET.get(candidateKey);
    if (object) break;
  }

  if (!object) {
    return c.text("Track not found", 404);
  }

  try {
    const analyzer = getContainer(c.env.ANALYZER_CONTAINER, "waveform");
    await analyzer.startAndWaitForPorts();

    const analyzeUrl = new URL("http://container/analyze");
    if (typeof payload?.resolution === "number" && Number.isInteger(payload.resolution)) {
      analyzeUrl.searchParams.set("resolution", String(payload.resolution));
    }
    const presetKey = payload?.preset;
    if (presetKey) {
      analyzeUrl.searchParams.set("preset", presetKey);
    }

    const analyzeResponse = await analyzer.fetch(
      new Request(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? inferContentTypeFromKey(object.key),
        },
        body: await object.arrayBuffer(),
      }),
    );

    if (!analyzeResponse.ok) {
      const text = await analyzeResponse.text();
      console.error("Analyzer container failed", text);
      return c.text("Analyzer failed", 502);
    }

    const body = await analyzeResponse.json<Record<string, unknown>>();
    return c.json(body, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Failed to analyze track", error);
    return c.text("Analysis failed", 500);
  }
});

app.get("/api/playlists", requireAuth, async (c) => {
  try {
    const playlists = await loadPlaylistsFromDb(c.env.TRACKS_DB);
    return c.json({ playlists }, 200, {
      "Cache-Control": "no-store",
    });
  } catch (error) {
    console.error("Failed to load playlists", error);
    return c.json({ playlists: [] }, 500);
  }
});

app.post("/api/playlists", requireAuth, async (c) => {
  let payload: PlaylistCreatePayload | null = null;
  try {
    payload = (await c.req.json()) as PlaylistCreatePayload;
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return c.text("Playlist title is required", 400);
  }

  const description =
    typeof payload?.description === "string" ? payload.description.trim() : "";
  const mood = typeof payload?.mood === "string" ? payload.mood.trim() : "";

  const tags = normalizeStringArrayInput(payload?.tags);
  const folderPath = normalizeStringArrayInput(payload?.folderPath);

  const accentFrom = normalizeOptionalString(payload?.accentFrom);
  const accentTo = normalizeOptionalString(payload?.accentTo);
  const cover = normalizeOptionalString(payload?.cover);

  const isPinned =
    typeof payload?.isPinned === "boolean" && payload.isPinned ? 1 : 0;
  const isFavorite =
    typeof payload?.isFavorite === "boolean" && payload.isFavorite ? 1 : 0;

  const playlistId = crypto.randomUUID();

  const statement = `
    INSERT INTO playlists (
      id,
      title,
      description,
      mood,
      tags,
      accent_from,
      accent_to,
      cover,
      folder_path,
      is_pinned,
      is_favorite
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const insert = await c.env.TRACKS_DB.prepare(statement)
    .bind(
      playlistId,
      title,
      description,
      mood,
      tags.length ? JSON.stringify(tags) : null,
      accentFrom,
      accentTo,
      cover,
      folderPath.length ? JSON.stringify(folderPath) : null,
      isPinned,
      isFavorite,
    )
    .run();

  if (!insert.success) {
    return c.text("Failed to create playlist", 500);
  }

  const playlist = await loadPlaylistById(c.env.TRACKS_DB, playlistId);
  if (!playlist) {
    return c.text("Playlist not found", 404);
  }

  return c.json({ playlist }, 201);
});

app.patch("/api/playlists/:playlistId", requireAuth, async (c) => {
  const playlistId = c.req.param("playlistId");
  if (!playlistId) {
    return c.text("Playlist identifier is required", 400);
  }

  let payload: PlaylistMetaUpdatePayload | null = null;
  try {
    payload = (await c.req.json()) as PlaylistMetaUpdatePayload;
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  if (!payload) {
    return c.text("No updates provided", 400);
  }

  const setStatements: string[] = [];
  const parameters: Array<number | string> = [];

  if (Object.prototype.hasOwnProperty.call(payload, "isPinned")) {
    const normalizedPinned =
      payload.isPinned === undefined ? undefined : payload.isPinned ? 1 : 0;
    if (normalizedPinned !== undefined) {
      setStatements.push("is_pinned = ?");
      parameters.push(normalizedPinned);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "isFavorite")) {
    const normalizedFavorite =
      payload.isFavorite === undefined ? undefined : payload.isFavorite ? 1 : 0;
    if (normalizedFavorite !== undefined) {
      setStatements.push("is_favorite = ?");
      parameters.push(normalizedFavorite);
    }
  }

  if (!setStatements.length) {
    return c.text("No updates provided", 400);
  }

  setStatements.push("updated_at = CURRENT_TIMESTAMP");

  const update = await c.env.TRACKS_DB.prepare(
    `UPDATE playlists SET ${setStatements.join(", ")} WHERE id = ?`,
  )
    .bind(...parameters, playlistId)
    .run();

  if (!update.success || update.changes === 0) {
    return c.text("Playlist not found", 404);
  }

  const playlist = await loadPlaylistById(c.env.TRACKS_DB, playlistId);
  if (!playlist) {
    return c.text("Playlist not found", 404);
  }

  return c.json({ playlist });
});

app.post("/api/playlists/:playlistId/tracks", requireAuth, async (c) => {
  const playlistId = c.req.param("playlistId");
  if (!playlistId) {
    return c.text("Playlist identifier is required", 400);
  }

  let payload: PlaylistTrackInput | null = null;
  try {
    payload = (await c.req.json()) as PlaylistTrackInput;
  } catch {
    return c.text("Invalid JSON payload", 400);
  }

  const trackId = payload?.trackId;
  if (!trackId) {
    return c.text("Track identifier is required", 400);
  }

  let normalizedPosition: number;
  if (typeof payload?.position === "number" && !Number.isNaN(payload.position)) {
    normalizedPosition = payload.position;
  } else {
    normalizedPosition = await getNextPlaylistTrackPosition(
      c.env.TRACKS_DB,
      playlistId,
    );
  }

  const insert = await c.env.TRACKS_DB.prepare(
    `
      INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, ?)
    `,
  )
    .bind(playlistId, trackId, normalizedPosition)
    .run();

  if (!insert.success) {
    return c.text("Failed to add track to playlist", 500);
  }

  await touchPlaylistUpdatedAt(c.env.TRACKS_DB, playlistId);
  const playlist = await loadPlaylistById(c.env.TRACKS_DB, playlistId);
  if (!playlist) {
    return c.text("Playlist not found", 404);
  }

  return c.json({ playlist });
});

app.delete(
  "/api/playlists/:playlistId/tracks/:trackId",
  requireAuth,
  async (c) => {
    const playlistId = c.req.param("playlistId");
    const trackId = c.req.param("trackId");

    if (!playlistId || !trackId) {
      return c.text("Playlist and track identifiers are required", 400);
    }

    const removal = await c.env.TRACKS_DB.prepare(
      "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
    )
      .bind(playlistId, trackId)
      .run();

    if (!removal.success || removal.changes === 0) {
      return c.text("Track not found in playlist", 404);
    }

    await touchPlaylistUpdatedAt(c.env.TRACKS_DB, playlistId);
    const playlist = await loadPlaylistById(c.env.TRACKS_DB, playlistId);
    if (!playlist) {
      return c.text("Playlist not found", 404);
    }

    return c.json({ playlist });
  },
);

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
    // Only fall back to static assets for GET/HEAD that truly 404 from the API router.
    if (honoResponse.status !== 404 || (request.method !== "GET" && request.method !== "HEAD")) {
      return honoResponse;
    }

    // Rebuild the request without a consumed body to satisfy asset handler.
    const assetRequest = new Request(request.url, request);
    return serveAssets(assetRequest, env);
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

async function loadPlaylistsFromDb(
  db: D1Database,
  playlistId?: string,
): Promise<PlaylistRecord[]> {
  const baseQuery = `
    SELECT
      id,
      title,
      description,
      mood,
      tags,
      accent_from,
      accent_to,
      cover,
      folder_path,
      is_pinned,
      is_favorite,
      created_at,
      updated_at
    FROM playlists
    ${playlistId ? "WHERE id = ?" : ""}
    ORDER BY created_at DESC
  `;

  const statement = playlistId
    ? db.prepare(baseQuery).bind(playlistId)
    : db.prepare(baseQuery);

  const { results } = await statement.all<PlaylistRow>();
  const rows = results ?? [];
  if (!rows.length) {
    return [];
  }

  const playlistIds = rows.map((row) => row.id);
  const placeholders = playlistIds.map(() => "?").join(", ");

  const trackStatement = db.prepare(
    `SELECT playlist_id, track_id, position FROM playlist_tracks WHERE playlist_id IN (${placeholders}) ORDER BY position ASC`,
  );
  const trackResults = await trackStatement
    .bind(...playlistIds)
    .all<PlaylistTrackRow>();

  const trackMap = new Map<string, string[]>();
  for (const row of trackResults.results ?? []) {
    const next = trackMap.get(row.playlist_id) ?? [];
    next.push(row.track_id);
    trackMap.set(row.playlist_id, next);
  }

  return rows.map((row) =>
    mapPlaylistRow(row, trackMap.get(row.id) ?? []),
  );
}

async function loadPlaylistById(
  db: D1Database,
  playlistId: string,
): Promise<PlaylistRecord | null> {
  const playlists = await loadPlaylistsFromDb(db, playlistId);
  return playlists[0] ?? null;
}

function mapPlaylistRow(
  row: PlaylistRow,
  trackIds: string[],
): PlaylistRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mood: row.mood,
    tags: parseStringArray(row.tags),
    accentFrom: row.accent_from ?? undefined,
    accentTo: row.accent_to ?? undefined,
    cover: row.cover ?? undefined,
    folderPath: parseStringArray(row.folder_path),
    isPinned: Boolean(row.is_pinned),
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trackIds,
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry));
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function normalizeStringArrayInput(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function getNextPlaylistTrackPosition(
  db: D1Database,
  playlistId: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COALESCE(MAX(position), 0) AS max_position FROM playlist_tracks WHERE playlist_id = ?",
    )
    .bind(playlistId)
    .first<{ max_position: number | null }>();

  const maxPosition = row?.max_position ?? 0;
  return maxPosition + 1;
}

async function touchPlaylistUpdatedAt(
  db: D1Database,
  playlistId: string,
): Promise<void> {
  await db
    .prepare("UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(playlistId)
    .run();
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
  const encoded = encodeURIComponent(decoded ?? rawTrackId);
  const encodedUri = encodeURI(decoded ?? rawTrackId);
  const keys = new Set<string>();

  if (decoded) {
    keys.add(decoded);
  }

  if (!decoded || decoded !== rawTrackId) {
    keys.add(rawTrackId);
  }

  keys.add(encoded);
  keys.add(encodedUri);

  // Common layout: objects live under a "tracks/" prefix in R2. Try both forms.
  const candidates = Array.from(keys);
  for (const key of candidates) {
    if (!key.startsWith("tracks/")) {
      keys.add(`tracks/${key}`);
    }
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
