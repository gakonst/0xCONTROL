import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
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
const MAX_DOWNLOAD_BYTES = 180 * 1024 * 1024; // ~180MB safety guard

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

type PcmData = { samples: Float32Array; sampleRate: number };

type DownloadMeta = {
  title: string;
  artist: string;
  duration: number;
  ext: string;
  fileName: string;
};

function sanitizeFileName(name: string): string {
  const collapsed = name.replace(/[\t\n\r]+/g, " ").trim();
  const safe = collapsed
    .replace(/[^a-zA-Z0-9_\-\. ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return safe.length ? safe : `track-${randomUUID()}.mp3`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise((resolve, reject) => {
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

function decodeToPCM(input: Buffer): Promise<PcmData> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-v",
      "error",
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

async function runYtDlpMeta(url: string): Promise<DownloadMeta> {
  console.log("[analyzer] meta:start", { url });
  const meta = await new Promise<DownloadMeta>((resolve, reject) => {
    const proc = spawn("yt-dlp", ["-j", "--no-playlist", url]);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on("data", (chunk) => stdout.push(chunk as Buffer));
    proc.stderr.on("data", (chunk) => stderr.push(chunk as Buffer));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `yt-dlp meta exited with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
      }

      try {
        const json = JSON.parse(Buffer.concat(stdout).toString("utf8"));
        const title = (json.title as string | undefined) ?? "Untitled";
        const artist =
          (json.artist as string | undefined) ||
          (json.uploader as string | undefined) ||
          "Unknown Artist";
        const duration = Number(json.duration ?? 0) || 0;
        const ext = (json.ext as string | undefined) ?? "mp3";
        const rawFileName = sanitizeFileName(`${title}.${ext}`);
        resolve({ title, artist, duration, ext, fileName: rawFileName });
      } catch (error) {
        reject(error);
      }
    });
  });

  console.log("[analyzer] meta:done", meta);

  return meta;
}

async function downloadAudio(url: string, targetPath: string): Promise<Buffer> {
  console.log("[analyzer] download:start", { url, targetPath });
  const proc = spawn("yt-dlp", [
    "-f",
    "bestaudio/best",
    "--no-playlist",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    targetPath,
    url,
  ]);

  const stderr: Buffer[] = [];
  proc.stderr.on("data", (chunk) => stderr.push(chunk as Buffer));

  await new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `yt-dlp download failed with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
      }
      resolve();
    });
  });

  const file = await readFile(targetPath);
  console.log("[analyzer] download:done", { bytes: file.byteLength });
  if (file.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }
  if (file.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Downloaded file exceeds ${MAX_DOWNLOAD_BYTES / (1024 * 1024)} MB limit`);
  }
  await unlink(targetPath).catch(() => {});
  return file;
}

async function handleDownload(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response(JSON.stringify({ error: "A valid URL is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    console.log("[analyzer] handleDownload", { url });
    const meta = await runYtDlpMeta(url);
    const id = randomUUID();
    const targetPath = `/tmp/${id}.mp3`;
    const buffer = await downloadAudio(url, targetPath);
    console.log("[analyzer] buffer ready", { bytes: buffer.byteLength, title: meta.title });

    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.byteLength),
      "X-Filename": sanitizeFileName(meta.fileName.replace(/\.[^.]+$/, ".mp3")),
      "X-Track-Title": meta.title,
      "X-Track-Artist": meta.artist,
      "X-Track-Duration": String(meta.duration || 0),
      "Cache-Control": "no-store",
    });

    return new Response(buffer, { status: 200, headers });
  } catch (error) {
    console.error("download failed", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleAnalyze(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const resolutionParam = url.searchParams.get("resolution");
    const resolution = resolutionParam ? Number(resolutionParam) : undefined;
    const presetKey = (url.searchParams.get("preset") as PresetKey | null) ?? "reference-clean";
    const preset = PRESETS[presetKey] ?? PRESETS["reference-clean"];

    const effectiveResolution = resolution ?? preset.resolution;
    const fftSize = preset.fftSize;

    const body = await readBody(req);
    if (!body || body.byteLength === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }

    const pcm = await decodeToPCM(body);
    const waveform: WaveformData = await analyzeWaveformFromBuffer(
      toAudioBuffer(pcm) as any,
      { resolution: effectiveResolution, fftSize },
    );

    const finalWaveform = applyPresetToWaveform(waveform, preset);
    const { bpm, beatOffsetSeconds } = estimateBpmAndOffsetFromBuffer(toAudioBuffer(pcm) as any);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ waveform: finalWaveform, preset: presetKey, bpm, beatOffsetSeconds }));
  } catch (error) {
    console.error("Analyze failed", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://container");

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && url.pathname === "/download") {
    const request = new Request("http://container/download", {
      method: "POST",
      headers: req.headers as any,
      body: req,
    });

    void handleDownload(request)
      .then((response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        response.arrayBuffer().then((buffer) => res.end(Buffer.from(buffer)));
      })
      .catch((error) => {
        console.error("download handler crashed", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal error" }));
      });

    return;
  }

  if (req.method === "POST" && url.pathname === "/analyze") {
    void handleAnalyze(req, res, url);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(PORT, () => {
  console.log(`[analyzer] listening on :${PORT}`);
});
