/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer, type ContainerNamespace } from "@cloudflare/containers";
import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { PresetKey } from "../src/lib/waveform";
import type { WaveformAnalysis, WaveformData } from "../src/lib/waveform";

type AnnotationColor = "red" | "blue" | "pink" | "cyan";

interface TrackRecord {
  id: string;
  path: string;
  name: string;
  artist?: string;
  album?: string;
  genre?: string;
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
  album: string | null;
  genre: string | null;
  duration_seconds: number | null;
  bpm: number | null;
  musical_key: string | null;
  annotation_color: AnnotationColor | null;
  annotation_note: string | null;
}

interface WaveformRow {
  track_id: string;
  waveform_json: string;
  bpm: number | null;
  beat_offset_seconds: number | null;
  duration_seconds: number;
  sample_rate: number | null;
  updated_at: string;
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

type R2EventNotification = {
  eventType?: string;
  key?: string;
  object?: {
    key?: string;
    name?: string;
  };
};

type AnalyzerMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  durationSeconds?: number;
};

type UploadResult = {
  trackId: string;
  status: "created" | "exists";
  track: TrackRecord | null;
  playlist: PlaylistRecord | null;
  error?: string;
};

export class AnalyzerContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars = {
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: this.env.R2_BUCKET_NAME,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_MOUNT_PATH: this.env.R2_MOUNT_PATH ?? "/mnt/r2",
  };
}

export interface Env {
  ASSETS: Fetcher;
  SONG_PASSWORD: string;
  TRACKS_BUCKET: R2Bucket;
  TRACKS_DB: D1Database;
  ANALYZER_CONTAINER: ContainerNamespace;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  R2_MOUNT_PATH?: string;
}

const INDEX_PATH = "index.html";

type WorkerContext = { Bindings: Env };

const app = new Hono<WorkerContext>();

const ANALYZER_CONCURRENCY = 2;
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".flac", ".wav"]);

const analyzerSemaphore = createSemaphore(ANALYZER_CONCURRENCY);

function createSemaphore(limit: number) {
  let available = limit;
  const queue: Array<(release: () => void) => void> = [];

  const acquire = () =>
    new Promise<() => void>((resolve) => {
      const grant = () => {
        available -= 1;
        resolve(() => {
          available += 1;
          const next = queue.shift();
          if (next) next(grant);
        });
      };

      if (available > 0) {
        grant();
        return;
      }

      queue.push(grant);
    });

  return { acquire };
}

async function withAnalyzerLock<T>(worker: () => Promise<T>): Promise<T> {
  const release = await analyzerSemaphore.acquire();
  try {
    return await worker();
  } finally {
    release();
  }
}

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
  const catalog = await buildCatalogResponse(c.env, c.executionCtx);
  return c.json(catalog, 200, {
    "Cache-Control": "no-store",
  });
});

app.get("/api/catalog", requireAuth, async (c) => {
  const catalog = await buildCatalogResponse(c.env, c.executionCtx);
  return c.json(catalog, 200, {
    "Cache-Control": "no-store",
  });
});

app.post("/api/tracks/upload", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.text("Invalid form payload", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.text("file is required", 400);
  }

  const rawTrackId = normalizeFormString(form.get("trackId"));
  const fileName = typeof file.name === "string" ? file.name.trim() : "";
  const trackId = rawTrackId ?? fileName;

  if (!trackId) {
    return c.text("trackId is required", 400);
  }

  const playlistTitle = normalizeFormString(form.get("playlist"));
  const result = await handleTrackUpload(c.env, file, trackId, playlistTitle);

  if (result.error) {
    return c.json(result, 500);
  }

  return c.json(result, result.status === "created" ? 201 : 200);
});

app.post("/api/tracks/upload/bulk", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.text("Invalid form payload", 400);
  }

  const playlistTitle = normalizeFormString(form.get("playlist"));
  const rawTrackIds = normalizeFormString(form.get("trackIds"));

  let trackIds: string[] = [];
  if (rawTrackIds) {
    try {
      const parsed = JSON.parse(rawTrackIds);
      if (Array.isArray(parsed)) {
        trackIds = parsed.map((entry) => String(entry));
      }
    } catch {
      return c.text("trackIds must be a JSON array", 400);
    }
  }

  const files = [...form.getAll("files"), ...form.getAll("file")].filter(
    (entry) => entry instanceof File,
  ) as File[];

  if (files.length === 0) {
    return c.text("files are required", 400);
  }

  if (trackIds.length && trackIds.length !== files.length) {
    return c.text("trackIds length must match files length", 400);
  }

  const results = await runWithConcurrency(files, 3, (file, index) => {
    const rawTrackId = trackIds[index];
    const fileName = typeof file.name === "string" ? file.name.trim() : "";
    const trackId = rawTrackId ?? fileName;

    if (!trackId) {
      return Promise.resolve({
        trackId: rawTrackId ?? "",
        status: "exists",
        track: null,
        playlist: null,
        error: "trackId is required",
      });
    }

    return handleTrackUpload(c.env, file, trackId, playlistTitle);
  });

  const hasError = results.some((result) => result.error);

  return c.json(
    {
      results,
    },
    hasError ? 207 : 200,
  );
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

  const trackId = candidateKeys[0];

  // First try to serve cached analysis from D1.
  const cached = await loadWaveformFromDb(c.env.TRACKS_DB, trackId);
  if (cached) {
    return c.json(cached, 200, { "Cache-Control": "no-store" });
  }

  try {
    const analyzeResponse = await withAnalyzerLock(async () => {
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

      const healthResponse = await analyzer.fetch(
        new Request("http://container/health", { method: "GET" }),
      );
      const healthBuffer = await healthResponse.arrayBuffer();
      const healthText = new TextDecoder().decode(healthBuffer);

      console.log("Analyzer health", {
        status: healthResponse.status,
        size: healthBuffer.byteLength,
        body: healthText.trim(),
      });

      return analyzer.fetch(
        new Request(analyzeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: candidateKeys }),
        }),
      );
    });

    if (analyzeResponse.status === 404) {
      return c.text("Track not found", 404);
    }

    if (!analyzeResponse.ok) {
      const text = await analyzeResponse.text();
      console.error("Analyzer container failed", text);
      return c.text("Analyzer failed", 502);
    }

    if (!analyzeResponse.body) {
      console.error("Analyzer returned empty body");
      return c.text("Analyzer failed", 502);
    }

    return new Response(analyzeResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
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

app.delete("/api/playlists/:playlistId", requireAuth, async (c) => {
  const playlistId = c.req.param("playlistId");
  if (!playlistId) {
    return c.text("Playlist identifier is required", 400);
  }

  const playlist = await loadPlaylistById(c.env.TRACKS_DB, playlistId);
  if (!playlist) {
    return c.text("Playlist not found", 404);
  }

  await c.env.TRACKS_DB.prepare(
    "DELETE FROM playlist_tracks WHERE playlist_id = ?",
  )
    .bind(playlistId)
    .run();

  const removal = await c.env.TRACKS_DB.prepare(
    "DELETE FROM playlists WHERE id = ?",
  )
    .bind(playlistId)
    .run();

  if (!removal.success || removal.changes === 0) {
    return c.text("Playlist not found", 404);
  }

  return c.json({ playlistId });
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
  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      const keys = extractR2EventKeys(message.body);
      if (!keys.length) {
        message.ack();
        continue;
      }

      try {
        for (const key of keys) {
          await analyzeTrackFromQueue(env, key);
        }
        message.ack();
      } catch (error) {
        console.warn("Queue analysis failed", error);
        message.retry();
      }
    }
  },
  async scheduled(controller, env, ctx): Promise<void> {
    console.log("Scheduled backfill start", { schedule: controller.cron });
    ctx.waitUntil(runScheduledWaveformBackfill(env));
  },
} satisfies ExportedHandler<Env>;

async function buildCatalogResponse(
  env: Env,
  executionCtx?: ExecutionContext,
): Promise<CatalogResponse> {
  try {
    const tracks = await loadCatalogFromDb(env.TRACKS_DB);

    // Kick off analysis for any tracks missing cached waveforms.
    const ensureWaveforms = analyzeMissingTracks(env, tracks);
    if (executionCtx) {
      executionCtx.waitUntil(ensureWaveforms);
    }

    return { tracks };
  } catch (error) {
    console.error("Failed to load catalog from D1", error);
    return { tracks: [] };
  }
}

async function runScheduledWaveformBackfill(env: Env): Promise<void> {
  try {
    const tracks = await loadCatalogFromDb(env.TRACKS_DB);
    await analyzeMissingTracks(env, tracks);
  } catch (error) {
    console.error("Scheduled waveform backfill failed", error);
  }
}

async function loadCatalogFromDb(db: D1Database): Promise<TrackRecord[]> {
  const statement = `
    SELECT
      track_id,
      name,
      artist,
      album,
      genre,
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
    album: row.album ?? undefined,
    genre: row.genre ?? undefined,
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

async function loadTrackById(
  db: D1Database,
  trackId: string,
): Promise<TrackRecord | null> {
  const statement = `
    SELECT
      track_id,
      name,
      artist,
      album,
      genre,
      duration_seconds,
      bpm,
      musical_key,
      annotation_color,
      annotation_note
    FROM track_metadata
    WHERE track_id = ?
    LIMIT 1
  `;

  const row = await db.prepare(statement).bind(trackId).first<TrackMetadataRow>();
  return row ? convertMetadataRowToTrack(row) : null;
}

async function ensurePlaylistWithTrack(
  db: D1Database,
  title: string,
  trackId: string,
): Promise<PlaylistRecord | null> {
  const existing = await findPlaylistByTitle(db, title);
  const playlistId = existing ?? crypto.randomUUID();

  if (!existing) {
    const insert = await db
      .prepare(
        `
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
        `,
      )
      .bind(
        playlistId,
        title,
        "",
        "",
        null,
        null,
        null,
        null,
        null,
        0,
        0,
      )
      .run();

    if (!insert.success) {
      return null;
    }
  }

  const position = await getNextPlaylistTrackPosition(db, playlistId);

  const insertTrack = await db
    .prepare(
      `
        INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
        VALUES (?, ?, ?)
      `,
    )
    .bind(playlistId, trackId, position)
    .run();

  if (insertTrack.success) {
    await touchPlaylistUpdatedAt(db, playlistId);
  }

  return loadPlaylistById(db, playlistId);
}

async function findPlaylistByTitle(
  db: D1Database,
  title: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM playlists WHERE title = ? ORDER BY created_at DESC LIMIT 1")
    .bind(title)
    .first<{ id: string }>();

  return row?.id ?? null;
}

async function loadWaveformFromDb(
  db: D1Database,
  trackId: string,
): Promise<WaveformAnalysis | null> {
  const statement = `
    SELECT
      track_id,
      waveform_json,
      bpm,
      beat_offset_seconds,
      duration_seconds,
      sample_rate,
      updated_at
    FROM waveform_analysis
    WHERE track_id = ?
    LIMIT 1
  `;

  const { results } = await db.prepare(statement).bind(trackId).all<WaveformRow>();
  const row = results?.[0];
  if (!row) return null;

  try {
    const waveform = JSON.parse(row.waveform_json) as WaveformData;
    if (!waveform || !Array.isArray(waveform.bars)) return null;
    return {
      waveform,
      bpm: row.bpm ?? null,
      beatOffsetSeconds: row.beat_offset_seconds ?? null,
    };
  } catch (error) {
    console.warn("Failed to parse cached waveform JSON", error);
    return null;
  }
}

async function saveWaveformToDb(
  db: D1Database,
  trackId: string,
  analysis: {
    waveform: WaveformData;
    bpm: number | null;
    beatOffsetSeconds: number | null;
  },
) {
  const statement = `
    INSERT INTO waveform_analysis (
      track_id,
      waveform_json,
      bpm,
      beat_offset_seconds,
      duration_seconds,
      sample_rate,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(track_id) DO UPDATE SET
      waveform_json = excluded.waveform_json,
      bpm = excluded.bpm,
      beat_offset_seconds = excluded.beat_offset_seconds,
      duration_seconds = excluded.duration_seconds,
      sample_rate = excluded.sample_rate,
      updated_at = CURRENT_TIMESTAMP
  `;

  const payload = JSON.stringify(analysis.waveform);
  const durationSeconds = analysis.waveform.durationSeconds ?? null;
  const roundedDuration = Number.isFinite(durationSeconds ?? NaN)
    ? Math.max(0, Math.round(durationSeconds ?? 0))
    : null;
  const sampleRate = analysis.waveform.sampleRate ?? null;

  await db
    .prepare(statement)
    .bind(
      trackId,
      payload,
      analysis.bpm,
      analysis.beatOffsetSeconds,
      durationSeconds,
      sampleRate,
    )
    .run();

  const roundedBpm = analysis.bpm !== null && Number.isFinite(analysis.bpm)
    ? Math.round(analysis.bpm)
    : null;

  await db
    .prepare(
      `
        UPDATE track_metadata
        SET
          bpm = COALESCE(?, bpm),
          duration_seconds = COALESCE(?, duration_seconds),
          updated_at = CURRENT_TIMESTAMP
        WHERE track_id = ?
      `,
    )
    .bind(roundedBpm, roundedDuration, trackId)
    .run();
}

async function findTracksMissingWaveform(db: D1Database): Promise<string[]> {
  const statement = `
    SELECT track_id
    FROM track_metadata
    WHERE track_id NOT IN (SELECT track_id FROM waveform_analysis)
  `;

  const { results } = await db.prepare(statement).all<{ track_id: string }>();
  return (results ?? []).map((row) => row.track_id);
}

async function analyzeMissingTracks(env: Env, tracks: TrackRecord[]) {
  if (!tracks.length) return;

  const missing = await findTracksMissingWaveform(env.TRACKS_DB);
  if (!missing.length) return;

  for (const trackId of missing) {
    const record = tracks.find((t) => t.id === trackId);
    const keyCandidates = buildTrackKeyCandidates(record?.path ?? trackId);

    try {
      const body = await withAnalyzerLock(async () => {
        const analyzer = getContainer(env.ANALYZER_CONTAINER, "waveform");
        await analyzer.startAndWaitForPorts();

        const analyzeUrl = new URL("http://container/analyze");
        const analyzeResponse = await analyzer.fetch(
          new Request(analyzeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys: keyCandidates }),
          }),
        );

        if (analyzeResponse.status === 404) {
          console.warn("Missing R2 object for unanalyzed track", trackId);
          return null;
        }

        if (!analyzeResponse.ok) {
          console.warn(
            "Analyzer failed while backfilling",
            trackId,
            analyzeResponse.status,
          );
          return null;
        }

        const responseBuffer = await analyzeResponse.arrayBuffer();
        const responseSize = responseBuffer.byteLength;
        const responseText = new TextDecoder().decode(responseBuffer);

        console.log("Analyzer response", {
          status: analyzeResponse.status,
          size: responseSize,
        });

        if (!responseText.trim()) {
          console.warn("Analyzer returned empty body");
          return null;
        }

        try {
          return JSON.parse(responseText) as Record<string, unknown>;
        } catch (error) {
          console.warn("Analyzer response parse failed", {
            error: (error as Error).message,
            size: responseSize,
            snippet: responseText.slice(0, 200),
          });
          return null;
        }
      });

      if (!body) {
        continue;
      }

      const waveform = body.waveform as WaveformData | undefined;
      const bpm = (body.bpm as number | null | undefined) ?? null;
      const beatOffsetSeconds =
        (body.beatOffsetSeconds as number | null | undefined) ?? null;

      if (waveform && Array.isArray(waveform.bars)) {
        await saveWaveformToDb(env.TRACKS_DB, trackId, {
          waveform,
          bpm,
          beatOffsetSeconds,
        });
      }
    } catch (error) {
      console.warn("Backfill analysis failed", trackId, error);
    }
  }
}

async function analyzeTrackByKeys(
  env: Env,
  keys: string[],
): Promise<{ waveform?: WaveformData; bpm?: number | null; beatOffsetSeconds?: number | null } | null> {
  if (!keys.length) {
    return null;
  }

  try {
    return await withAnalyzerLock(async () => {
      const analyzer = getContainer(env.ANALYZER_CONTAINER, "waveform");
      await analyzer.startAndWaitForPorts();

      const analyzeUrl = new URL("http://container/analyze");

      const healthResponse = await analyzer.fetch(
        new Request("http://container/health", { method: "GET" }),
      );
      const healthBuffer = await healthResponse.arrayBuffer();
      const healthText = new TextDecoder().decode(healthBuffer);

      console.log("Analyzer health", {
        status: healthResponse.status,
        size: healthBuffer.byteLength,
        body: healthText.trim(),
      });

      const analyzeResponse = await analyzer.fetch(
        new Request(analyzeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        }),
      );

      if (analyzeResponse.status === 404) {
        console.warn("Analyzer missing track for upload", keys[0]);
        return null;
      }

      if (!analyzeResponse.ok) {
        console.warn("Analyzer failed for upload", analyzeResponse.status);
        return null;
      }

      const responseBuffer = await analyzeResponse.arrayBuffer();
      const responseSize = responseBuffer.byteLength;
      const responseText = new TextDecoder().decode(responseBuffer);

      console.log("Analyzer response", {
        status: analyzeResponse.status,
        size: responseSize,
      });

      if (!responseText.trim()) {
        console.warn("Analyzer returned empty body");
        return null;
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(responseText) as Record<string, unknown>;
      } catch (error) {
        console.warn("Analyzer response parse failed", {
          error: (error as Error).message,
          size: responseSize,
          snippet: responseText.slice(0, 200),
        });
        return null;
      }

      const waveform = body.waveform as WaveformData | undefined;
      const bpm = (body.bpm as number | null | undefined) ?? null;
      const beatOffsetSeconds =
        (body.beatOffsetSeconds as number | null | undefined) ?? null;

      return { waveform, bpm, beatOffsetSeconds };
    });
  } catch (error) {
    console.warn("Analyzer upload failed", error);
    return null;
  }
}

async function fetchMetadataFromAnalyzer(
  env: Env,
  keys: string[],
): Promise<AnalyzerMetadata> {
  if (!keys.length) {
    return {};
  }

  try {
    return await withAnalyzerLock(async () => {
      const analyzer = getContainer(env.ANALYZER_CONTAINER, "waveform");
      await analyzer.startAndWaitForPorts();

      const metadataUrl = new URL("http://container/metadata");
      const response = await analyzer.fetch(
        new Request(metadataUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        }),
      );

      if (response.status === 404) {
        console.warn("Metadata probe missing track", keys[0]);
        return {};
      }

      if (!response.ok) {
        console.warn("Metadata probe failed", response.status);
        return {};
      }

      return (await response.json()) as AnalyzerMetadata;
    });
  } catch (error) {
    console.warn("Metadata probe error", error);
    return {};
  }
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

function normalizeFormString(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDurationSeconds(value?: number): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function parseTrackNameFromFilename(trackId: string): { title: string; artist?: string } {
  const baseName = trackId.split("/").pop() ?? trackId;
  const dotIndex = baseName.lastIndexOf(".");
  const withoutExt = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const parts = withoutExt.split(" - ");

  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim() || withoutExt,
    };
  }

  return { title: withoutExt.trim() || trackId };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}

async function ensureTrackMetadata(
  env: Env,
  trackId: string,
  keyCandidates: string[],
): Promise<TrackRecord | null> {
  const existingTrack = await loadTrackById(env.TRACKS_DB, trackId);
  if (existingTrack) {
    return existingTrack;
  }

  const metadata = await fetchMetadataFromAnalyzer(env, keyCandidates);
  const fallback = parseTrackNameFromFilename(trackId);
  const name =
    normalizeOptionalString(metadata.title) ??
    normalizeOptionalString(fallback.title) ??
    "Untitled Track";
  const artist =
    normalizeOptionalString(metadata.artist) ??
    normalizeOptionalString(fallback.artist) ??
    "Unknown Artist";
  const album = normalizeOptionalString(metadata.album);
  const genre = normalizeOptionalString(metadata.genre);
  const durationSeconds = normalizeDurationSeconds(metadata.durationSeconds);

  const insert = await env.TRACKS_DB.prepare(
    `
      INSERT INTO track_metadata (
        track_id,
        name,
        artist,
        album,
        genre,
        duration_seconds,
        bpm,
        musical_key,
        annotation_color,
        annotation_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      trackId,
      name,
      artist,
      album,
      genre,
      durationSeconds ?? 0,
      0,
      "--",
      null,
      null,
    )
    .run();

  if (!insert.success) {
    return null;
  }

  return loadTrackById(env.TRACKS_DB, trackId);
}

async function handleTrackUpload(
  env: Env,
  file: File,
  trackId: string,
  playlistTitle: string | null,
): Promise<UploadResult> {
  try {
    const existingTrack = await loadTrackById(env.TRACKS_DB, trackId);
    const existingWaveform = existingTrack
      ? await loadWaveformFromDb(env.TRACKS_DB, trackId)
      : null;

    const uploadBuffer = await file.arrayBuffer();
    const uploadContentType = file.type || inferContentTypeFromKey(trackId);

    const candidates = buildTrackKeyCandidates(trackId);
    let object: R2ObjectBody | null = null;
    let objectKey: string | null = null;
    for (const candidate of candidates) {
      object = await env.TRACKS_BUCKET.get(candidate);
      if (object) {
        objectKey = candidate;
        break;
      }
    }

    if (!object) {
      await env.TRACKS_BUCKET.put(trackId, uploadBuffer, {
        httpMetadata: { contentType: uploadContentType },
      });
      objectKey = trackId;
    }

    const keyCandidates = buildTrackKeyCandidates(objectKey ?? trackId);

    if (!existingTrack) {
      const ensuredTrack = await ensureTrackMetadata(env, trackId, keyCandidates);
      if (!ensuredTrack) {
        return {
          trackId,
          status: "created",
          track: null,
          playlist: null,
          error: "Failed to write track metadata",
        };
      }
    }

    let playlist: PlaylistRecord | null = null;
    if (playlistTitle) {
      playlist = await ensurePlaylistWithTrack(env.TRACKS_DB, playlistTitle, trackId);
    }

    const track = await loadTrackById(env.TRACKS_DB, trackId);

    return {
      trackId,
      status: existingTrack ? "exists" : "created",
      track,
      playlist,
    };
  } catch (error) {
    return {
      trackId,
      status: "exists",
      track: null,
      playlist: null,
      error: (error as Error).message,
    };
  }
}

async function analyzeTrackFromQueue(env: Env, objectKey: string): Promise<void> {
  if (!isAudioObjectKey(objectKey)) {
    return;
  }

  const trackId = normalizeTrackIdFromObjectKey(objectKey);
  if (!trackId) {
    return;
  }

  const cached = await loadWaveformFromDb(env.TRACKS_DB, trackId);
  if (cached) {
    return;
  }

  const keyCandidates = buildTrackKeyCandidates(trackId);
  const track = await ensureTrackMetadata(env, trackId, keyCandidates);
  if (!track) {
    throw new Error("Failed to ensure track metadata");
  }

  const analysis = await analyzeTrackByKeys(env, keyCandidates);
  if (!analysis?.waveform || !Array.isArray(analysis.waveform.bars)) {
    throw new Error("Analysis failed");
  }

  await saveWaveformToDb(env.TRACKS_DB, trackId, {
    waveform: analysis.waveform,
    bpm: analysis.bpm ?? null,
    beatOffsetSeconds: analysis.beatOffsetSeconds ?? null,
  });
}

function extractR2EventKeys(body: unknown): string[] {
  let payload = body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return [];
    }
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const events = Array.isArray(payload) ? payload : [payload];
  const keys = new Set<string>();

  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }

    const record = event as R2EventNotification;
    if (record.eventType && record.eventType !== "object-create") {
      continue;
    }

    const key = record.object?.key ?? record.object?.name ?? record.key;
    if (typeof key === "string" && key.trim().length > 0) {
      keys.add(key.trim());
    }
  }

  return Array.from(keys);
}

function normalizeTrackIdFromObjectKey(objectKey: string): string {
  const trimmed = objectKey.trim();
  const withoutPrefix = trimmed.startsWith("tracks/")
    ? trimmed.slice("tracks/".length)
    : trimmed;
  const segments = withoutPrefix.split("/").filter(Boolean);
  if (segments.length > 0) {
    return segments[segments.length - 1];
  }
  return withoutPrefix;
}

function isAudioObjectKey(objectKey: string): boolean {
  const lower = objectKey.toLowerCase();
  return Array.from(AUDIO_EXTENSIONS).some((ext) => lower.endsWith(ext));
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
  const base = decoded ?? rawTrackId;
  const encoded = encodeURIComponent(base);
  const encodedUri = encodeURI(base);
  const encodedStrict = encodeURIComponent(base).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const plusEncoded = encoded.replace(/%20/g, "+");
  const basePlus = base.replace(/ /g, "+");
  const keys = new Set<string>();

  if (decoded) {
    keys.add(decoded);
  }

  if (!decoded || decoded !== rawTrackId) {
    keys.add(rawTrackId);
  }

  keys.add(base);
  keys.add(basePlus);
  keys.add(encoded);
  keys.add(plusEncoded);
  keys.add(encodedUri);
  keys.add(encodedStrict);

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
