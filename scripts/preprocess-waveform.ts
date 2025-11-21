#!/usr/bin/env bun
/**
 * Precompute Rekordbox-style waveform data using ffmpeg + the shared analyzer.
 *
 * Usage:
 *   bun scripts/preprocess-waveform.ts /path/to/input.mp3 [output.json]
 *
 * Writes JSON (bars + metadata) that the preview page can consume without
 * decoding audio in the browser. Output defaults to
 *   tracks/waveforms/<basename>.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { analyzeWaveformFromBuffer } from "../src/lib/waveform";

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
};

async function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: bun scripts/preprocess-waveform.ts <input audio> [output.json]");
    process.exit(1);
  }

  const output =
    outputArg ??
    join(process.cwd(), "tracks", "waveforms", `${basename(input)}.json`);

  const pcm = await decodeToPCM(input);
  const audioBuffer = toAudioBuffer(pcm);

  const waveform = await analyzeWaveformFromBuffer(audioBuffer, {
    resolution: 1800,
    fftSize: 2048,
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        source: basename(input),
        generatedAt: new Date().toISOString(),
        ...waveform,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`✅ Waveform written to ${output}`);
}

async function decodeToPCM(inputPath: string): Promise<{
  samples: Float32Array;
  sampleRate: number;
}> {
  const { stdout } = await Bun.$`
    ffmpeg -v error -i ${inputPath} -ac 2 -ar 44100 -f f32le pipe:1
  `.nothrow();

  if (!stdout) {
    throw new Error("ffmpeg did not produce PCM data");
  }

  const buffer = await stdout.arrayBuffer();
  const floats = new Float32Array(buffer);
  const frames = floats.length / 2; // stereo

  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    mono[i] = (floats[i * 2] + floats[i * 2 + 1]) * 0.5;
  }

  return { samples: mono, sampleRate: 44100 };
}

function toAudioBuffer(pcm: { samples: Float32Array; sampleRate: number }): PseudoAudioBuffer {
  return {
    length: pcm.samples.length,
    numberOfChannels: 1,
    sampleRate: pcm.sampleRate,
    getChannelData: () => pcm.samples,
  };
}

await main();
