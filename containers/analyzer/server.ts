import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import {
  analyzeWaveformFromBuffer,
  applyPresetToWaveform,
  PRESETS,
  type PresetKey,
  type WaveformData,
} from "./src/lib/waveform";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_INPUT_BYTES = 120 * 1024 * 1024; // ~120MB safety guard

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

type PcmData = { samples: Float32Array; sampleRate: number };

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

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ waveform: finalWaveform, preset: presetKey }));
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

  if (req.method === "POST" && url.pathname === "/analyze") {
    void handleAnalyze(req, res, url);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(PORT, () => {
  console.log(`[analyzer] listening on :${PORT}`);
});
