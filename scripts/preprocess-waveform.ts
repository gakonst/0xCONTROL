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
import { analyzeWaveformFromBuffer } from "../src/lib/waveform";

type PseudoAudioBuffer = {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
};

async function main() {
  const [input, outputArg] = process.argv.slice(2);
  if (!input) {
    console.error("Usage: bun scripts/preprocess-waveform.ts <input audio> [output dir]");
    process.exit(1);
  }

  const outputDir =
    outputArg ?? join(process.cwd(), "tracks", "waveforms");

  const pcm = await decodeToPCM(input);
  const audioBuffer = toAudioBuffer(pcm);
  const durationSeconds = pcm.samples.length / pcm.sampleRate;

  const waveform = await analyzeWaveformFromBuffer(audioBuffer, {
    resolution: 1800,
    fftSize: 2048,
  });

  const slug = slugify(basename(input));
  const jsonPath = join(outputDir, `${slug}.json`);
  const htmlPath = join(outputDir, `${slug}.preview.html`);
  const latestJsonPath = join(outputDir, "waveform.json");
  const latestHtmlPath = join(outputDir, "preview.html");

  const payload = {
    trackName: basename(input),
    sourcePath: input,
    relativeTrackPath: encodeRelativePath(outputDir, input),
    generatedAt: new Date().toISOString(),
    sampleRate: waveform.sampleRate,
    durationSeconds,
    waveform: { ...waveform, durationSeconds },
  };

  await mkdir(outputDir, { recursive: true });
  const serialized = JSON.stringify(payload, null, 2);
  const html = buildPreviewHtml(payload);

  await Promise.all([
    writeFile(jsonPath, serialized, "utf8"),
    writeFile(htmlPath, html, "utf8"),
    writeFile(latestJsonPath, serialized, "utf8"),
    writeFile(latestHtmlPath, html, "utf8"),
  ]);

  console.log("✅ Saved:");
  console.log(`  • ${jsonPath}`);
  console.log(`  • ${htmlPath}`);
  if (jsonPath !== latestJsonPath) console.log(`  • ${latestJsonPath}`);
  if (htmlPath !== latestHtmlPath) console.log(`  • ${latestHtmlPath}`);
  console.log("Open the preview HTML to scrub and verify.");
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

function buildPreviewHtml(payload: {
  trackName: string;
  relativeTrackPath: string;
  generatedAt: string;
  durationSeconds: number;
  waveform: { bars: any[]; durationSeconds: number };
}) {
  const serialized = JSON.stringify(payload).replace(/<\//g, "<\\/");
  const barCount = payload.waveform.bars.length;
  const canvasWidth = Math.max(1200, Math.min(3600, barCount * 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Waveform Preview · ${escapeHtml(payload.trackName)}</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #0b1020; color: #e2e8f0; }
      body { margin: 0; padding: 20px; }
      .card { background: #0f172a; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; box-shadow: 0 15px 35px rgba(0,0,0,0.35); }
      canvas { width: 100%; height: 320px; display: block; border-radius: 10px; background: #020617; border: 1px solid #1f2937; }
      .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
      .pill { padding: 6px 10px; border-radius: 999px; background: #111827; color: #cbd5e1; font-size: 12px; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin-top:0">Waveform Preview</h2>
      <div class="row">
        <span class="pill" id="nowPlaying">Now playing: ${escapeHtml(payload.trackName)}</span>
        <audio id="audio" src="${payload.relativeTrackPath}" controls preload="auto"></audio>
        <span id="time" class="pill">0:00 / ${formatSeconds(payload.durationSeconds)}</span>
      </div>
      <canvas id="wave" width="${canvasWidth}" height="320"></canvas>
    </div>
    <script type="application/json" id="waveform-data">${serialized}</script>
    <script>
      const data = JSON.parse(document.getElementById('waveform-data').textContent);
      const canvas = document.getElementById('wave');
      const ctx = canvas.getContext('2d');
      const audio = document.getElementById('audio');
      const timeLabel = document.getElementById('time');
      const bars = data.waveform.bars;
      const width = canvas.width;
      const height = canvas.height;
      const pixelsPerBar = bars.length / width;
      const midY = height / 2;
      const nowPlaying = document.getElementById('nowPlaying');
      if (nowPlaying) nowPlaying.textContent = 'Now playing: ' + ${JSON.stringify(payload.trackName)};

      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = width;
      baseCanvas.height = height;
      const baseCtx = baseCanvas.getContext('2d');

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
        const seconds = Math.ceil(data.durationSeconds || 0);
        for (let s = 0; s <= seconds; s++) {
          const x = s * pixelsPerSecond;
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
      function updateTime(){const cur=audio.currentTime||0;const dur=audio.duration||data.durationSeconds;timeLabel.textContent=fmt(cur)+' / '+fmt(dur);}

      const pixelsPerSecond = width / Math.max(data.durationSeconds, 0.001);

      function drawPlayhead() {
        ctx.clearRect(0,0,width,height);
        ctx.drawImage(baseCanvas,0,0);
        const dur = audio.duration || data.durationSeconds || 1;
        const x = Math.max(0, Math.min(width, (audio.currentTime||0) * pixelsPerSecond));
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

      canvas.addEventListener('click', (e)=>{if(!audio.duration)return;const rect=canvas.getBoundingClientRect();const ratio=(e.clientX-rect.left)/rect.width;audio.currentTime=ratio*audio.duration;});
      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('play', ()=>{updateTime(); if(!rafId) loop();});
      audio.addEventListener('pause', ()=>{updateTime(); cancelAnimationFrame(rafId); rafId=undefined; drawPlayhead();});
      audio.addEventListener('loadedmetadata', ()=>{updateTime(); drawPlayhead();});

      renderBaseWaveform();
      drawPlayhead();
      updateTime();
    </script>
  </body>
</html>`;
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
