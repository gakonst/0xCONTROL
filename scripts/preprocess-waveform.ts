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
import { basename, dirname, join, relative, sep } from "node:path";
import {
  analyzeWaveformFromBuffer,
  applyPresetToWaveform,
  estimateBpmFromBuffer,
  PRESETS,
  type PresetConfig,
  type PresetKey,
} from "../src/lib/waveform";

const DEFAULT_OUTPUT_DIR = "tracks/waveforms";
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHANNELS = 2;

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
};

async function main() {
  const { input, outputDir, presetKey } = parseArgs(process.argv.slice(2));
  const presetKeys: PresetKey[] = presetKey ? [presetKey] : (Object.keys(PRESETS) as PresetKey[]);

  const pcm = await decodeToPCM(input);
  const audioBuffer = toAudioBuffer(pcm);
  const durationSeconds = pcm.samples.length / pcm.sampleRate;
  const bpm = estimateBpmFromBuffer(audioBuffer as any);

  const slug = slugify(basename(input));
  const latestJsonPath = join(outputDir, "waveform.json");
  const latestHtmlPath = join(outputDir, "preview.html");

  await mkdir(outputDir, { recursive: true });

  const payloads: ReturnType<typeof buildPayload>[] = [];

  for (const key of presetKeys) {
    const preset = PRESETS[key];
    const waveform = await analyzeWaveformFromBuffer(audioBuffer, {
      resolution: preset.resolution,
      fftSize: preset.fftSize,
    });
    const transformedWaveform = applyPresetToWaveform(waveform, preset);
    const payload = buildPayload({
      input,
      outputDir,
      durationSeconds,
      bpm,
      waveform: transformedWaveform,
      presetKey: key,
    });
    payloads.push(payload);

    const jsonPath = join(outputDir, `${slug}.${key}.json`);
    const htmlPath = join(outputDir, `${slug}.${key}.preview.html`);
    await Promise.all([
      writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8"),
      writeFile(htmlPath, buildPreviewHtml([payload], key), "utf8"),
    ]);
  }

  await Promise.all([
    writeFile(latestJsonPath, JSON.stringify(payloads, null, 2), "utf8"),
    writeFile(latestHtmlPath, buildPreviewHtml(payloads, presetKeys[0]), "utf8"),
  ]);

  console.log("✅ Saved:");
  console.log(`  • ${latestJsonPath}`);
  console.log(`  • ${latestHtmlPath}`);
  console.log(`  • Per-preset JSON/HTML in ${outputDir}`);
  console.log("Open preview.html to scrub and switch presets with the dropdown.");
}

type ParseResult = {
  input: string;
  outputDir: string;
  presetKey?: PresetKey;
};

function parseArgs(argv: string[]): ParseResult {
  const options: { trackPath?: string; outputDir?: string; preset?: PresetKey } = {
    outputDir: DEFAULT_OUTPUT_DIR,
    preset: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--track") {
      options.trackPath = argv[++i];
    } else if (arg === "--output") {
      options.outputDir = argv[++i];
    } else if (arg === "--preset") {
      const preset = argv[++i] as PresetKey;
      if (!PRESETS[preset]) throw new Error(`Unknown preset: ${preset}`);
      options.preset = preset;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.trackPath) {
      options.trackPath = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  if (!options.trackPath) {
    throw new Error(
      "Missing track path. Usage: bun scripts/preprocess-waveform.ts --track tracks/<file>.mp3 [--preset reference-clean]",
    );
  }

  return {
    input: options.trackPath,
    outputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    presetKey: options.preset,
  };
}

async function decodeToPCM(inputPath: string): Promise<{
  samples: Float32Array;
  sampleRate: number;
}> {
  const proc = Bun.spawn([
    "ffmpeg",
    "-v",
    "error",
    "-i",
    inputPath,
    "-ac",
    "2",
    "-ar",
    "44100",
    "-f",
    "f32le",
    "pipe:1",
  ]);

  const buffer = await new Response(proc.stdout).arrayBuffer();
  const exit = await proc.exited;
  if (exit !== 0 || buffer.byteLength === 0) {
    const stderrText = await new Response(proc.stderr).text();
    throw new Error(
      `ffmpeg exited with code ${exit}. stderr: ${stderrText.slice(0, 4000)}`,
    );
  }

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
    duration: pcm.samples.length / pcm.sampleRate,
    getChannelData: () => pcm.samples,
  };
}

function slugify(value: string): string {
  const base = value.toLowerCase().replace(/\.[^.]+$/, "");
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "waveform";
}

function encodeRelativePath(from: string, to: string): string {
  const rel = relative(from, to) || basename(to);
  return rel.split(sep).map(encodeURIComponent).join("/");
}

function buildPreviewHtml(payloads: Array<ReturnType<typeof buildPayload>>, defaultPreset: PresetKey) {
  const serialized = JSON.stringify(payloads).replace(/<\//g, "<\\/");
  const first = payloads.find((p) => p.preset === defaultPreset) ?? payloads[0];
  const barCount = first.waveform.bars.length;
  const canvasWidth = Math.max(1200, Math.min(3600, barCount * 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Waveform Preview · ${escapeHtml(first.trackName)}</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #0b1020; color: #e2e8f0; }
      body { margin: 0; padding: 20px; }
      .card { background: #0f172a; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; box-shadow: 0 15px 35px rgba(0,0,0,0.35); }
      canvas { width: 100%; height: 320px; display: block; border-radius: 10px; background: #020617; border: 1px solid #1f2937; }
      .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .pill { padding: 6px 10px; border-radius: 999px; background: #111827; color: #cbd5e1; font-size: 12px; }
      a { color: #93c5fd; }
      select { background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:6px 10px; border-radius:10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin-top:0">Waveform Preview</h2>
      <div class="row">
        <span class="pill" id="nowPlaying">Now playing: ${escapeHtml(first.trackName)}</span>
        <audio id="audio" src="${first.relativeTrackPath}" controls preload="auto"></audio>
        <span id="time" class="pill">0:00 / ${formatSeconds(first.durationSeconds)}</span>
        <label style="display:flex;align-items:center;gap:8px;">Preset
          <select id="presetSelect"></select>
        </label>
      </div>
      <canvas id="wave" width="${canvasWidth}" height="320"></canvas>
    </div>
    <script type="application/json" id="waveform-data">${serialized}</script>
    <script>
      const payloads = JSON.parse(document.getElementById('waveform-data').textContent);
      const payloadByPreset = Object.fromEntries(payloads.map(p => [p.preset, p]));
      let current = payloadByPreset[${JSON.stringify(defaultPreset)}] || payloads[0];
      const canvas = document.getElementById('wave');
      const ctx = canvas.getContext('2d');
      const audio = document.getElementById('audio');
      const timeLabel = document.getElementById('time');
      const presetSelect = document.getElementById('presetSelect');
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;
      const nowPlaying = document.getElementById('nowPlaying');
      if (nowPlaying) nowPlaying.textContent = 'Now playing: ' + current.trackName;

      for (const p of payloads) {
        const opt = document.createElement('option');
        opt.value = p.preset;
        opt.textContent = p.preset;
        if (p.preset === current.preset) opt.selected = true;
        presetSelect.appendChild(opt);
      }

      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = width;
      baseCanvas.height = height;
      const baseCtx = baseCanvas.getContext('2d');

      let bars = current.waveform.bars;
      let pixelsPerBar = bars.length / width;
      const pixelsPerSecond = () => width / Math.max(current.durationSeconds, 0.001);

      function renderBaseWaveform() {
        baseCtx.clearRect(0,0,width,height);
        for (let x = 0; x < width; x++) {
          const start = Math.floor(x * pixelsPerBar);
          const end = Math.min(bars.length, Math.max(start + 1, Math.ceil((x+1) * pixelsPerBar)));
          let amp=0,r=0,g=0,b=0,c=0;
          for (let i=start;i<end;i++){const bar=bars[i];amp+=bar.amplitude;r+=bar.color.r;g+=bar.color.g;b+=bar.color.b;c++; }
          if(!c) continue;
          amp/=c;r/=c;g/=c;b/=c;
          const h = amp * (height * 0.48);
          const top = midY - h;
          baseCtx.fillStyle = 'rgb(' + Math.round(r*255) + ',' + Math.round(g*255) + ',' + Math.round(b*255) + ')';
          baseCtx.fillRect(x, top, 1, h*2);
        }
        baseCtx.fillStyle = 'rgba(255,255,255,0.08)';
        baseCtx.fillRect(0, midY-0.5, width, 1);

        // Second markers: thin low-opacity lines every 1s, stronger every 10s
        const seconds = Math.ceil(current.durationSeconds || 0);
        for (let s = 0; s <= seconds; s++) {
          const x = s * pixelsPerSecond();
          if (x > width) break;
          baseCtx.strokeStyle = s % 10 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
          baseCtx.lineWidth = s % 10 === 0 ? 1.5 : 1;
          baseCtx.beginPath();
          baseCtx.moveTo(x + 0.5, 0);
          baseCtx.lineTo(x + 0.5, height);
          baseCtx.stroke();
        }
      }

      function fmt(sec){const m=Math.floor(sec/60);const s=Math.floor(sec%60).toString().padStart(2,'0');return m+':'+s;}
      function updateTime(){const cur=audio.currentTime||0;const dur=audio.duration||current.durationSeconds;timeLabel.textContent=fmt(cur)+' / '+fmt(dur);}

      function drawPlayhead() {
        ctx.clearRect(0,0,width,height);
        ctx.drawImage(baseCanvas,0,0);
        const dur = audio.duration || current.durationSeconds || 1;
        const x = Math.max(0, Math.min(width, (audio.currentTime||0) * pixelsPerSecond()));
        const playing = !audio.paused;
        const color = playing ? 'rgba(255,255,255,0.95)' : '#ef4444';
        const glow = playing ? 'rgba(255,255,255,0.35)' : 'rgba(239,68,68,0.4)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(x+0.5,0);
        ctx.lineTo(x+0.5,height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      let rafId;
      function loop() {
        drawPlayhead();
        rafId = requestAnimationFrame(loop);
      }

      canvas.addEventListener('click', (e)=>{if(!audio.duration)return;const rect=canvas.getBoundingClientRect();const ratio=(e.clientX-rect.left)/rect.width;audio.currentTime=ratio*audio.duration;if(audio.paused){drawPlayhead();updateTime();}});
      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('play', ()=>{updateTime(); if(!rafId) loop();});
      audio.addEventListener('pause', ()=>{updateTime(); cancelAnimationFrame(rafId); rafId=undefined; drawPlayhead();});
      audio.addEventListener('loadedmetadata', ()=>{updateTime(); drawPlayhead();});

      // Spacebar play/pause
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          if (audio.paused) {
            audio.play().catch(()=>{});
          } else {
            audio.pause();
          }
        }
      });

      renderBaseWaveform();
      drawPlayhead();
      updateTime();

      function switchPreset(key) {
        const next = payloadByPreset[key];
        if (!next) return;
        current = next;
        bars = current.waveform.bars;
        pixelsPerBar = bars.length / width;
        if (nowPlaying) nowPlaying.textContent = 'Now playing: ' + current.trackName;
        audio.src = current.relativeTrackPath;
        renderBaseWaveform();
        drawPlayhead();
        updateTime();
      }

      presetSelect.addEventListener('change', (e)=> {
        switchPreset(e.target.value);
      });
    </script>
  </body>
</html>`;
}

function buildPayload(params: {
  input: string;
  outputDir: string;
  durationSeconds: number;
  bpm?: number | null;
  waveform: { bars: any[]; durationSeconds?: number; sampleRate: number };
  presetKey: PresetKey;
}) {
  return {
    trackName: basename(params.input),
    sourcePath: params.input,
    relativeTrackPath: encodeRelativePath(params.outputDir, params.input),
    generatedAt: new Date().toISOString(),
    sampleRate: params.waveform.sampleRate,
    durationSeconds: params.durationSeconds,
    bpm: params.bpm ?? null,
    waveform: { ...params.waveform, durationSeconds: params.durationSeconds },
    preset: params.presetKey,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, "0");
  return `${m}:${rest}`;
}

await main();
