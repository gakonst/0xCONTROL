/// <reference types="@cloudflare/workers-types" />

import {
  getSandbox,
  proxyToSandbox,
  type Sandbox as CloudflareSandbox,
} from "@cloudflare/sandbox";
import type {
  D1Database,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

export { Sandbox } from "@cloudflare/sandbox";

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
  Sandbox: DurableObjectNamespace<CloudflareSandbox>;
}

const INDEX_PATH = "index.html";
const TRACK_SANDBOX_ID = "single-track-ingest";
const SANDBOX_DOWNLOAD_DIR = "/workspace/downloads";
const TRACK_AUDIO_EXTENSION = "mp3";
const SUPPORTED_SOURCE_HOSTS = new Set<string>([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

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
    allowMethods: ["GET", "OPTIONS", "PATCH", "POST"],
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

app.post("/api/ingest/track", requireAuth, async (c) => {
  const requestUrl = new URL(c.req.url);
  const sourceParam = requestUrl.searchParams.get("url");
  if (!sourceParam) {
    return c.text("Missing ?url parameter", 400);
  }

  const trimmed = sourceParam.trim();
  try {
    const parsed = new URL(trimmed);
    if (!SUPPORTED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return c.text("Only YouTube URLs are supported", 400);
    }

    const result = await ingestTrackFromSource({
      sourceUrl: parsed.toString(),
      env: c.env,
    });
    return c.json(result, 201);
  } catch (error) {
    console.error("Track ingestion failed", error);
    return c.text("Failed to ingest track", 500);
  }
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
    const sandboxResponse = await proxyToSandbox(request, env);
    if (sandboxResponse) {
      return sandboxResponse;
    }

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

  headers.set("Content-Type", "audio/mpeg");
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

function isValidAnnotationColor(value: string): value is AnnotationColor {
  return (
    value === "red" || value === "blue" || value === "pink" || value === "cyan"
  );
}

type YtDlpMetadata = {
  id?: string;
  title?: string;
  track?: string;
  artist?: string;
  artists?: Array<string | { name?: string }> | string;
  uploader?: string;
  duration?: number | string | null;
};

type CanonicalTrackDetails = {
  title: string;
  artist: string;
  canonicalName: string;
  fileBaseName: string;
  storageKey: string;
  durationSeconds: number;
  bpm: number;
  musicalKey: string;
};

type TrackIngestResult = {
  trackId: string;
  storageKey: string;
  name: string;
  artist: string;
  durationSeconds: number;
  sourceUrl: string;
};

async function ingestTrackFromSource(options: {
  sourceUrl: string;
  env: Env;
}): Promise<TrackIngestResult> {
  const sandbox = getSandbox(options.env.Sandbox, TRACK_SANDBOX_ID, {
    sleepAfter: "5m",
  });
  console.log("sandbox created");

  const { metadata, localFilePath } = await downloadTrackAudio({
    sandbox,
    sourceUrl: options.sourceUrl,
  });

  // const canonical = buildCanonicalTrackDetails(metadata);
  // const audioBytes = await readSandboxFileAsUint8Array(sandbox, localFilePath);

  // await options.env.TRACKS_BUCKET.put(canonical.storageKey, audioBytes, {
  //   httpMetadata: {
  //     contentType: "audio/mpeg",
  //   },
  // });

  // await upsertTrackMetadata(options.env.TRACKS_DB, canonical);
  return {} as any;

  // return {
  //   status: "complete",
  //   trackId: canonical.storageKey,
  //   storageKey: canonical.storageKey,
  //   name: canonical.title,
  //   artist: canonical.artist,
  //   durationSeconds: canonical.durationSeconds,
  //   sourceUrl: options.sourceUrl,
  // };
}

function buildCanonicalTrackDetails(
  metadata: YtDlpMetadata,
): CanonicalTrackDetails {
  const rawTitle =
    pickFirstString([metadata.track, metadata.title]) ?? "Untitled Track";
  const rawArtist =
    pickFirstString([
      metadata.artist,
      formatArtists(metadata.artists),
      metadata.uploader,
    ]) ?? "Unknown Artist";

  const title = sanitizeRichComponent(rawTitle) || "Untitled Track";
  const artist = sanitizeRichComponent(rawArtist) || "Unknown Artist";
  const canonicalName = `${title} - ${artist}`;

  return {
    title,
    artist,
    canonicalName,
    fileBaseName: canonicalName,
    storageKey: `${canonicalName}.${TRACK_AUDIO_EXTENSION}`,
    durationSeconds: normalizeDuration(metadata.duration),
    bpm: 0,
    musicalKey: "--",
  };
}

function sanitizeRichComponent(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-");
  const filtered = normalized.replace(/[^0-9A-Za-z _'&()[\],.!-]+/g, " ");
  return filtered.replace(/\s+/g, " ").trim();
}

function normalizeDuration(duration: unknown): number {
  if (typeof duration === "number" && Number.isFinite(duration)) {
    return Math.max(0, Math.round(duration));
  }
  if (typeof duration === "string") {
    const parsed = Number(duration);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }
  return 0;
}

async function downloadTrackAudio(options: {
  sandbox: CloudflareSandbox;
  sourceUrl: string;
}): Promise<{ metadata: YtDlpMetadata; localFilePath: string }> {
  const escapedUrl = shellEscape(options.sourceUrl);
  const outputTemplate = `${SANDBOX_DOWNLOAD_DIR}/%(id)s.%(ext)s`;
  const escapedTemplate = shellEscape(outputTemplate);
  const command = [
    "bash -lc",
    `"set -euo pipefail; mkdir -p ${SANDBOX_DOWNLOAD_DIR} && yt-dlp --no-playlist --extract-audio --audio-format mp3 --audio-quality 0 --add-metadata --print-json --output ${escapedTemplate} -- ${escapedUrl}"`,
  ].join(" ");

  const result = await options.sandbox.exec(command);
  if (!result.success) {
    throw new Error(result.stderr || "yt-dlp download failed");
  }

  const trimmed = result.stdout.trim();
  const payload = trimmed
    .split("\n")
    .filter((line) => line.length)
    .pop();
  if (!payload) {
    throw new Error("Unable to parse yt-dlp output");
  }

  const metadata = JSON.parse(payload) as YtDlpMetadata;
  const localId = metadata.id ?? "downloaded";
  const localFilePath = `${SANDBOX_DOWNLOAD_DIR}/${localId}.${TRACK_AUDIO_EXTENSION}`;
  return { metadata, localFilePath };
}

async function readSandboxFileAsUint8Array(
  sandbox: CloudflareSandbox,
  path: string,
): Promise<Uint8Array> {
  const result = await sandbox.readFile(path, { encoding: "base64" });
  if (!result.success || !result.content) {
    throw new Error("Audio file missing from sandbox");
  }

  const bytes = base64ToUint8Array(result.content);
  try {
    await sandbox.deleteFile(path);
  } catch {
    // non-fatal
  }
  return bytes;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function upsertTrackMetadata(
  db: D1Database,
  details: CanonicalTrackDetails,
): Promise<void> {
  const statement = `
    INSERT INTO track_metadata (track_id, name, artist, duration_seconds, bpm, musical_key)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(track_id) DO UPDATE SET
      name = excluded.name,
      artist = excluded.artist,
      duration_seconds = excluded.duration_seconds,
      bpm = excluded.bpm,
      musical_key = excluded.musical_key,
      updated_at = CURRENT_TIMESTAMP
  `;

  const result = await db
    .prepare(statement)
    .bind(
      details.storageKey,
      details.title,
      details.artist,
      details.durationSeconds,
      details.bpm,
      details.musicalKey,
    )
    .run();

  if (!result.success) {
    throw new Error("Failed to persist track metadata");
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function pickFirstString(
  candidates: Array<string | undefined | null>,
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return undefined;
}

function formatArtists(value: YtDlpMetadata["artists"]): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "name" in entry) {
          const maybeName = (entry as { name?: string }).name;
          return typeof maybeName === "string" ? maybeName : null;
        }
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
    if (entries.length) {
      return entries.join(", ");
    }
    return undefined;
  }
  return typeof value === "string" ? value : undefined;
}
