import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import {
  analyzeWaveformFromBuffer,
  applyPresetToWaveform,
  PRESETS,
  estimateBpmAndOffsetFromBuffer,
  type PresetKey,
  type WaveformData,
} from "./src/lib/waveform";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_INPUT_BYTES = 120 * 1024 * 1024; // ~120MB safety guard
const R2_MOUNT_PATH = process.env.R2_MOUNT_PATH ?? "/mnt/r2";
const NORMALIZED_MOUNT_PATH = normalize(R2_MOUNT_PATH);
const STREAM_PREFIX = "streams";

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

type PcmData = { samples: Float32Array; sampleRate: number };

type ProbeMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  durationSeconds?: number;
};

type AnalyzePathRequest = {
  keys?: string[];
  trackId?: string;
  path?: string;
};

type TranscodeRequest = {
  keys?: string[];
  trackId?: string;
  segmentSeconds?: number;
};

const RESPONSE_CHUNK_SIZE = 64 * 1024;

function writeJsonChunked(res: ServerResponse, payload: unknown) {
  const json = JSON.stringify(payload);
  res.writeHead(200, { "Content-Type": "application/json" });
  for (let offset = 0; offset < json.length; offset += RESPONSE_CHUNK_SIZE) {
    res.write(json.slice(offset, offset + RESPONSE_CHUNK_SIZE));
  }
  res.end();
  return json.length;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise((resolve, reject) => {
    req.on("aborted", () => {
      console.error("[analyzer] request aborted while reading body");
      reject(new Error("Request aborted"));
    });

    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_INPUT_BYTES) {
        reject(new Error("Input too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function resolveMountedPath(key: string): string | null {
  const trimmed = key.replace(/^\/+/, "").trim();
  if (!trimmed) return null;
  const candidate = normalize(join(NORMALIZED_MOUNT_PATH, trimmed));
  if (candidate === NORMALIZED_MOUNT_PATH) return null;
  if (!candidate.startsWith(NORMALIZED_MOUNT_PATH + sep)) return null;
  return candidate;
}

function normalizeKeyInput(payload: AnalyzePathRequest | null): string[] {
  const keys = new Set<string>();
  if (payload?.trackId) keys.add(payload.trackId);
  if (payload?.path) keys.add(payload.path);
  if (Array.isArray(payload?.keys)) {
    for (const entry of payload.keys) {
      if (typeof entry === "string" && entry.trim()) {
        keys.add(entry);
      }
    }
  }
  return Array.from(keys);
}

function sanitizeStreamId(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return null;
  }
  return trimmed;
}

function deriveStreamId(keys: string[], rawTrackId?: string | null): string | null {
  const direct = sanitizeStreamId(rawTrackId ?? undefined);
  if (direct) return direct;
  const fallback = keys[0]?.split("/").filter(Boolean).pop();
  return sanitizeStreamId(fallback ?? null);
}

function resolveStreamOutputDir(streamId: string): string | null {
  const candidate = normalize(join(NORMALIZED_MOUNT_PATH, STREAM_PREFIX, streamId));
  if (candidate === NORMALIZED_MOUNT_PATH) return null;
  if (!candidate.startsWith(NORMALIZED_MOUNT_PATH + sep)) return null;
  return candidate;
}

async function logMountStatus() {
  try {
    const info = await stat(NORMALIZED_MOUNT_PATH);
    const kind = info.isDirectory() ? "dir" : info.isFile() ? "file" : "other";
    console.log(
      `[analyzer] mount status path=${NORMALIZED_MOUNT_PATH} kind=${kind} size=${info.size}`,
    );

    if (info.isDirectory()) {
      const entries = await readdir(NORMALIZED_MOUNT_PATH);
      const sample = entries.slice(0, 10).join(", ");
      console.log(
        `[analyzer] mount entries count=${entries.length} sample=${sample || "(empty)"}`,
      );
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    console.warn(
      `[analyzer] mount status error path=${NORMALIZED_MOUNT_PATH} code=${code}`,
      error,
    );
  }
}

async function readFromMountedR2(keys: string[]): Promise<{ buffer: Buffer; key: string } | null> {
  console.log(
    `[analyzer] mount lookup start keys=${keys.length} mount=${NORMALIZED_MOUNT_PATH}`,
  );

  for (const key of keys) {
    const candidatePath = resolveMountedPath(key);
    if (!candidatePath) {
      console.warn(`[analyzer] mount lookup skip invalid key=${key}`);
      continue;
    }

    try {
      console.log(`[analyzer] mount lookup try key=${key} path=${candidatePath}`);
      const info = await stat(candidatePath);
      if (!info.isFile()) {
        console.warn(`[analyzer] mount lookup not-file path=${candidatePath}`);
        continue;
      }
      if (info.size > MAX_INPUT_BYTES) {
        console.warn(
          `[analyzer] mount lookup too-large path=${candidatePath} size=${info.size}`,
        );
        throw new Error("Input too large");
      }
      const buffer = await readFile(candidatePath);
      console.log(
        `[analyzer] mount lookup hit key=${key} bytes=${buffer.byteLength}`,
      );
      return { buffer, key };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.warn(`[analyzer] mount lookup miss path=${candidatePath}`);
        continue;
      }
      console.error(
        `[analyzer] mount lookup error path=${candidatePath} code=${code ?? "unknown"}`,
        error,
      );
      throw error;
    }
  }

  console.warn(`[analyzer] mount lookup complete no match`);
  return null;
}

async function findMountedFile(keys: string[]): Promise<{ path: string; key: string } | null> {
  console.log(
    `[analyzer] stream lookup start keys=${keys.length} mount=${NORMALIZED_MOUNT_PATH}`,
  );

  for (const key of keys) {
    const candidatePath = resolveMountedPath(key);
    if (!candidatePath) {
      console.warn(`[analyzer] stream lookup skip invalid key=${key}`);
      continue;
    }

    try {
      console.log(`[analyzer] stream lookup try key=${key} path=${candidatePath}`);
      const info = await stat(candidatePath);
      if (!info.isFile()) {
        console.warn(`[analyzer] stream lookup not-file path=${candidatePath}`);
        continue;
      }
      console.log(`[analyzer] stream lookup hit key=${key} size=${info.size}`);
      return { path: candidatePath, key };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.warn(`[analyzer] stream lookup miss path=${candidatePath}`);
        continue;
      }
      console.error(
        `[analyzer] stream lookup error path=${candidatePath} code=${code ?? "unknown"}`,
        error,
      );
      throw error;
    }
  }

  console.warn(`[analyzer] stream lookup complete no match`);
  return null;
}

function decodeToPCM(input: Buffer): Promise<PcmData> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-v",
      "error",
      "-err_detect",
      "ignore_err",
      "-fflags",
      "+discardcorrupt",
      "-i",
      "pipe:0",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-f",
      "f32le",
      "pipe:1",
    ]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk) => stdout.push(chunk as Buffer));
    ffmpeg.stderr.on("data", (chunk) => stderr.push(chunk as Buffer));

    ffmpeg.on("error", (err) => reject(err));

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 4000)}`,
          ),
        );
      }

      const buffer = Buffer.concat(stdout);
      if (buffer.byteLength === 0) {
        return reject(new Error("ffmpeg produced no output"));
      }

      // Stereo float32 interleaved → mono float32
      const floatView = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4,
      );

      const frames = Math.floor(floatView.length / 2);
      const mono = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) {
        mono[i] = (floatView[i * 2] + floatView[i * 2 + 1]) * 0.5;
      }

      resolve({ samples: mono, sampleRate: 44100 });
    });

    ffmpeg.stdin.on("error", (err) => reject(err));
    ffmpeg.stdin.end(input);
  });
}

function toAudioBuffer(pcm: PcmData): PseudoAudioBuffer {
  return {
    length: pcm.samples.length,
    numberOfChannels: 1,
    sampleRate: pcm.sampleRate,
    duration: pcm.samples.length / pcm.sampleRate,
    getChannelData(channel: number) {
      if (channel !== 0) throw new Error("Only mono channel available");
      return pcm.samples;
    },
  };
}

function normalizeTagValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length ? normalized : undefined;
}

function pickTag(tags: Record<string, string> | undefined, keys: string[]): string | undefined {
  if (!tags) return undefined;
  for (const key of keys) {
    const value = tags[key];
    if (value) return value;
  }
  return undefined;
}

async function probeMetadata(input: Buffer): Promise<ProbeMetadata> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "-i",
      "pipe:0",
    ]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    ffprobe.stdout.on("data", (chunk) => stdout.push(chunk as Buffer));
    ffprobe.stderr.on("data", (chunk) => stderr.push(chunk as Buffer));
    ffprobe.on("error", (err) => reject(err));

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `ffprobe exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 4000)}`,
          ),
        );
      }

      try {
        const raw = Buffer.concat(stdout).toString("utf8");
        const parsed = JSON.parse(raw) as {
          format?: { duration?: string; tags?: Record<string, unknown> };
        };

        const tagMap: Record<string, string> = {};
        const tags = parsed.format?.tags ?? {};
        for (const [key, value] of Object.entries(tags)) {
          const normalizedKey = key.toLowerCase();
          const normalizedValue = normalizeTagValue(value);
          if (normalizedValue) {
            tagMap[normalizedKey] = normalizedValue;
          }
        }

        const durationRaw = parsed.format?.duration;
        const duration = durationRaw ? Number.parseFloat(durationRaw) : NaN;
        const durationSeconds = Number.isFinite(duration) ? duration : undefined;

        resolve({
          title: pickTag(tagMap, ["title", "tit2"]),
          artist: pickTag(tagMap, ["artist", "album_artist", "tpe1"]),
          album: pickTag(tagMap, ["album", "talb"]),
          genre: pickTag(tagMap, ["genre", "tcon"]),
          durationSeconds,
        });
      } catch (error) {
        reject(error);
      }
    });

    ffprobe.stdin.on("error", (err) => reject(err));
    ffprobe.stdin.end(input);
  });
}

async function handleAnalyze(req: IncomingMessage, res: ServerResponse, url: URL) {
  const startedAt = Date.now();
  const contentType = req.headers["content-type"] ?? "";
  const contentLength = req.headers["content-length"] ?? "";

  try {
    const resolutionParam = url.searchParams.get("resolution");
    const resolution = resolutionParam ? Number(resolutionParam) : undefined;
    const presetKey = (url.searchParams.get("preset") as PresetKey | null) ?? "reference-clean";
    const preset = PRESETS[presetKey] ?? PRESETS["reference-clean"];

    const effectiveResolution = resolution ?? preset.resolution;
    const fftSize = preset.fftSize;

    console.log(
      `[analyzer] analyze start contentType=${contentType} contentLength=${contentLength} preset=${presetKey} resolution=${effectiveResolution} fftSize=${fftSize}`,
    );

    const isJson = contentType.includes("application/json");
    let inputBuffer: Buffer;
    let sourceLabel = "body";

    if (isJson) {
      const body = await readBody(req);
      console.log(`[analyzer] analyze body bytes=${body.byteLength}`);
      if (!body || body.byteLength === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Empty request body" }));
        return;
      }

      let payload: AnalyzePathRequest | null = null;
      try {
        payload = JSON.parse(body.toString("utf8")) as AnalyzePathRequest;
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        return;
      }

      const keys = normalizeKeyInput(payload);
      if (!keys.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "trackId, path, or keys is required" }));
        return;
      }

      const mounted = await readFromMountedR2(keys);
      if (!mounted) {
        console.warn(
          `[analyzer] analyze mount miss keys=${keys.length} mount=${NORMALIZED_MOUNT_PATH}`,
        );
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Track not found" }));
        return;
      }

      inputBuffer = mounted.buffer;
      sourceLabel = `r2:${mounted.key}`;
      console.log(
        `[analyzer] analyze mounted key=${mounted.key} bytes=${inputBuffer.byteLength}`,
      );
    } else {
      const body = await readBody(req);
      console.log(`[analyzer] analyze body bytes=${body.byteLength}`);
      if (!body || body.byteLength === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Empty request body" }));
        return;
      }

      inputBuffer = body;
    }

    const pcm = await decodeToPCM(inputBuffer);
    console.log(
      `[analyzer] analyze decoded source=${sourceLabel} samples=${pcm.samples.length} sampleRate=${pcm.sampleRate} duration=${(pcm.samples.length / pcm.sampleRate).toFixed(2)}s`,
    );

    const waveform: WaveformData = await analyzeWaveformFromBuffer(
      toAudioBuffer(pcm) as any,
      { resolution: effectiveResolution, fftSize },
    );

    const finalWaveform = applyPresetToWaveform(waveform, preset);
    const { bpm, beatOffsetSeconds } = estimateBpmAndOffsetFromBuffer(toAudioBuffer(pcm) as any);

    const bytes = writeJsonChunked(res, {
      waveform: finalWaveform,
      preset: presetKey,
      bpm,
      beatOffsetSeconds,
    });
    console.log(
      `[analyzer] analyze success bars=${finalWaveform.bars?.length ?? 0} bpm=${bpm ?? ""} bytes=${bytes} elapsedMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    console.error("[analyzer] analyze failed", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function handleMetadata(req: IncomingMessage, res: ServerResponse) {
  const startedAt = Date.now();
  const contentType = req.headers["content-type"] ?? "";
  const contentLength = req.headers["content-length"] ?? "";

  try {
    console.log(
      `[analyzer] metadata start contentType=${contentType} contentLength=${contentLength}`,
    );

    const isJson = contentType.includes("application/json");
    let inputBuffer: Buffer;
    let sourceLabel = "body";

    if (isJson) {
      const body = await readBody(req);
      console.log(`[analyzer] metadata body bytes=${body.byteLength}`);
      if (!body || body.byteLength === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Empty request body" }));
        return;
      }

      let payload: AnalyzePathRequest | null = null;
      try {
        payload = JSON.parse(body.toString("utf8")) as AnalyzePathRequest;
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        return;
      }

      const keys = normalizeKeyInput(payload);
      if (!keys.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "trackId, path, or keys is required" }));
        return;
      }

      const mounted = await readFromMountedR2(keys);
      if (!mounted) {
        console.warn(
          `[analyzer] metadata mount miss keys=${keys.length} mount=${NORMALIZED_MOUNT_PATH}`,
        );
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Track not found" }));
        return;
      }

      inputBuffer = mounted.buffer;
      sourceLabel = `r2:${mounted.key}`;
      console.log(
        `[analyzer] metadata mounted key=${mounted.key} bytes=${inputBuffer.byteLength}`,
      );
    } else {
      const body = await readBody(req);
      console.log(`[analyzer] metadata body bytes=${body.byteLength}`);
      if (!body || body.byteLength === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Empty request body" }));
        return;
      }

      inputBuffer = body;
    }

    const metadata = await probeMetadata(inputBuffer);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metadata));
    console.log(
      `[analyzer] metadata success source=${sourceLabel} elapsedMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    console.error("[analyzer] metadata failed", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

function transcodeToHls(
  inputPath: string,
  outputDir: string,
  segmentSeconds: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const playlistPath = join(outputDir, "index.m3u8");
    const segmentPattern = join(outputDir, "segment_%05d.m4s");

    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "aac",
      "-b:a",
      "192k",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "hls",
      "-hls_time",
      String(segmentSeconds),
      "-hls_playlist_type",
      "vod",
      "-hls_segment_type",
      "fmp4",
      "-hls_flags",
      "independent_segments",
      "-hls_fmp4_init_filename",
      "init.mp4",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);
    const stderr: Buffer[] = [];

    ffmpeg.stderr.on("data", (chunk) => stderr.push(chunk as Buffer));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 4000)}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

async function handleTranscode(req: IncomingMessage, res: ServerResponse) {
  const startedAt = Date.now();
  const contentType = req.headers["content-type"] ?? "";
  const contentLength = req.headers["content-length"] ?? "";

  try {
    console.log(
      `[analyzer] transcode start contentType=${contentType} contentLength=${contentLength}`,
    );

    const body = await readBody(req);
    if (!body || body.byteLength === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }

    let payload: TranscodeRequest | null = null;
    try {
      payload = JSON.parse(body.toString("utf8")) as TranscodeRequest;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }

    const keys = normalizeKeyInput(payload as AnalyzePathRequest);
    if (!keys.length) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "trackId, path, or keys is required" }));
      return;
    }

    const streamId = deriveStreamId(keys, payload?.trackId ?? null);
    if (!streamId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid trackId" }));
      return;
    }

    const outputDir = resolveStreamOutputDir(streamId);
    if (!outputDir) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid output path" }));
      return;
    }

    const source = await findMountedFile(keys);
    if (!source) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Track not found" }));
      return;
    }

    const segmentSecondsRaw = payload?.segmentSeconds;
    const segmentSeconds =
      typeof segmentSecondsRaw === "number" && Number.isFinite(segmentSecondsRaw)
        ? Math.min(15, Math.max(2, Math.round(segmentSecondsRaw)))
        : 6;

    await mkdir(outputDir, { recursive: true });
    await transcodeToHls(source.path, outputDir, segmentSeconds);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        streamId,
        playlistKey: `${STREAM_PREFIX}/${streamId}/index.m3u8`,
      }),
    );
    console.log(
      `[analyzer] transcode success key=${source.key} streamId=${streamId} elapsedMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    console.error("[analyzer] transcode failed", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://container");

  req.on("error", (error) => {
    console.error("[analyzer] request error", error);
  });

  res.on("error", (error) => {
    console.error("[analyzer] response error", error);
  });

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && url.pathname === "/analyze") {
    void handleAnalyze(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/metadata") {
    void handleMetadata(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/transcode") {
    void handleTranscode(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(PORT, () => {
  console.log(
    `[analyzer] listening on :${PORT} mount=${NORMALIZED_MOUNT_PATH} r2Account=${process.env.R2_ACCOUNT_ID ?? ""} r2Bucket=${process.env.R2_BUCKET_NAME ?? ""}`,
  );
  void logMountStatus();
});

process.on("unhandledRejection", (reason) => {
  console.error("[analyzer] unhandledRejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[analyzer] uncaughtException", error);
});
