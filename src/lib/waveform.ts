export type BandFrame = {
  bass: number;
  melody: number;
  voice: number;
  hats: number;
};

export type BandStats = {
  bassMax: number;
  melodyMax: number;
  voiceMax: number;
  hatsMax: number;
};

export type WaveformAnalysis = {
  frames: BandFrame[];
  frameRate: number;
  durationSeconds: number;
  stats: BandStats;
};

const WINDOW_SIZE = 2048;
const HOP_SIZE = 1024;
const TARGET_FRAME_RATE = 120;

const BAND_RANGES: Record<keyof BandFrame, [number, number]> = {
  bass: [20, 150],
  melody: [150, 800],
  voice: [800, 4000],
  hats: [6000, 16000],
};

const SMOOTHING: Record<keyof BandFrame, { attack: number; release: number }> = {
  bass: { attack: 0.25, release: 0.08 },
  melody: { attack: 0.2, release: 0.08 },
  voice: { attack: 0.18, release: 0.08 },
  hats: { attack: 0.16, release: 0.08 },
};

const HANN_WINDOW = buildHannWindow(WINDOW_SIZE);

export function extractWaveformFromAudioBuffer(
  buffer: AudioBuffer,
): WaveformAnalysis {
  const mono = mixDownToMono(buffer);
  const durationSeconds = buffer.duration;
  const frameCount = Math.max(1, Math.ceil(durationSeconds * TARGET_FRAME_RATE));
  const frames: BandFrame[] = Array.from({ length: frameCount }, () => ({
    bass: 0,
    melody: 0,
    voice: 0,
    hats: 0,
  }));

  const windowBuffer = new Float32Array(WINDOW_SIZE);

  for (let start = 0; start < mono.length; start += HOP_SIZE) {
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const sourceIndex = start + i;
      const sample = sourceIndex < mono.length ? mono[sourceIndex]! : 0;
      windowBuffer[i] = sample * HANN_WINDOW[i]!;
    }

    const magnitudes = performFftMagnitudes(windowBuffer);
    const energies = computeBandEnergies(magnitudes, buffer.sampleRate);
    const timeSeconds = start / buffer.sampleRate;
    const frameIndex = Math.min(
      frameCount - 1,
      Math.max(0, Math.floor(timeSeconds * TARGET_FRAME_RATE)),
    );

    const frame = frames[frameIndex]!;
    frame.bass = Math.max(frame.bass, energies.bass);
    frame.melody = Math.max(frame.melody, energies.melody);
    frame.voice = Math.max(frame.voice, energies.voice);
    frame.hats = Math.max(frame.hats, energies.hats);
  }

  const stats = computeBandStats(frames);
  const normalizedFrames = normalizeFrames(frames, stats);
  const smoothedFrames = smoothFrames(normalizedFrames);

  return {
    frames: smoothedFrames,
    frameRate: TARGET_FRAME_RATE,
    durationSeconds,
    stats,
  };
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels <= 1) {
    return buffer.getChannelData(0);
  }

  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] ?? 0;
    }
  }

  const scale = 1 / numberOfChannels;
  for (let i = 0; i < length; i++) {
    mono[i] *= scale;
  }

  return mono;
}

function computeBandStats(frames: BandFrame[]): BandStats {
  return frames.reduce<BandStats>(
    (stats, frame) => ({
      bassMax: Math.max(stats.bassMax, frame.bass),
      melodyMax: Math.max(stats.melodyMax, frame.melody),
      voiceMax: Math.max(stats.voiceMax, frame.voice),
      hatsMax: Math.max(stats.hatsMax, frame.hats),
    }),
    { bassMax: 0, melodyMax: 0, voiceMax: 0, hatsMax: 0 },
  );
}

function normalizeFrames(frames: BandFrame[], stats: BandStats): BandFrame[] {
  const normalized: BandFrame[] = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    normalized[i] = {
      bass: normalizeBand(frame.bass, stats.bassMax),
      melody: normalizeBand(frame.melody, stats.melodyMax),
      voice: normalizeBand(frame.voice, stats.voiceMax),
      hats: normalizeBand(frame.hats, stats.hatsMax),
    };
  }
  return normalized;
}

function normalizeBand(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  const safeMax = maxValue * 0.9 || maxValue;
  const normalized = clamp01(value / safeMax);
  return Math.sqrt(normalized);
}

function smoothFrames(frames: BandFrame[]): BandFrame[] {
  if (!frames.length) return frames;
  const keys = Object.keys(BAND_RANGES) as (keyof BandFrame)[];
  const smoothedSeries: Record<keyof BandFrame, number[]> = {
    bass: [],
    melody: [],
    voice: [],
    hats: [],
  };

  keys.forEach((key) => {
    const values = frames.map((frame) => frame[key]);
    const { attack, release } = SMOOTHING[key]!;
    smoothedSeries[key] = smoothArray(values, attack, release);
  });

  return frames.map((_, index) => ({
    bass: smoothedSeries.bass[index] ?? 0,
    melody: smoothedSeries.melody[index] ?? 0,
    voice: smoothedSeries.voice[index] ?? 0,
    hats: smoothedSeries.hats[index] ?? 0,
  }));
}

function computeBandEnergies(
  magnitudes: Float32Array,
  sampleRate: number,
): BandFrame {
  const binHz = sampleRate / WINDOW_SIZE;
  const energies: BandFrame = { bass: 0, melody: 0, voice: 0, hats: 0 };

  for (let bin = 1; bin < magnitudes.length; bin++) {
    const frequency = bin * binHz;
    const magnitude = magnitudes[bin]!;
    if (frequency >= BAND_RANGES.bass[0] && frequency < BAND_RANGES.bass[1]) {
      energies.bass += magnitude;
      continue;
    }
    if (
      frequency >= BAND_RANGES.melody[0] &&
      frequency < BAND_RANGES.melody[1]
    ) {
      energies.melody += magnitude;
      continue;
    }
    if (frequency >= BAND_RANGES.voice[0] && frequency < BAND_RANGES.voice[1]) {
      energies.voice += magnitude;
      continue;
    }
    if (frequency >= BAND_RANGES.hats[0] && frequency < BAND_RANGES.hats[1]) {
      energies.hats += magnitude;
    }
  }

  return energies;
}

function smoothArray(values: number[], attack: number, release: number): number[] {
  if (!values.length) return [];
  const forward: number[] = new Array(values.length);
  const backward: number[] = new Array(values.length);

  let current = values[0]!;
  forward[0] = current;
  for (let index = 1; index < values.length; index++) {
    const next = values[index]!;
    const coefficient = next > current ? attack : release;
    current = current + coefficient * (next - current);
    forward[index] = current;
  }

  current = values[values.length - 1]!;
  backward[values.length - 1] = current;
  for (let index = values.length - 2; index >= 0; index--) {
    const next = values[index]!;
    const coefficient = next > current ? attack : release;
    current = current + coefficient * (next - current);
    backward[index] = current;
  }

  return values.map((_, index) => clamp01((forward[index]! + backward[index]!) / 2));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function buildHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function performFftMagnitudes(samples: Float32Array): Float32Array {
  const n = samples.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  real.set(samples);
  const reverseTable = buildReverseTable(n);

  for (let i = 0; i < n; i++) {
    const j = reverseTable[i]!;
    if (j > i) {
      const tempReal = real[i]!;
      real[i] = real[j]!;
      real[j] = tempReal;
      const tempImag = imag[i]!;
      imag[i] = imag[j]!;
      imag[j] = tempImag;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < halfSize; j++) {
        const evenIndex = start + j;
        const oddIndex = evenIndex + halfSize;
        const angle = step * j;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        const tempReal =
          cosAngle * real[oddIndex]! - sinAngle * imag[oddIndex]!;
        const tempImag =
          sinAngle * real[oddIndex]! + cosAngle * imag[oddIndex]!;

        real[oddIndex] = real[evenIndex]! - tempReal;
        imag[oddIndex] = imag[evenIndex]! - tempImag;
        real[evenIndex] += tempReal;
        imag[evenIndex] += tempImag;
      }
    }
  }

  const magnitudes = new Float32Array(n / 2);
  for (let i = 0; i < magnitudes.length; i++) {
    const re = real[i]!;
    const im = imag[i]!;
    magnitudes[i] = Math.sqrt(re * re + im * im);
  }

  return magnitudes;
}

const reverseTableCache = new Map<number, Uint32Array>();

function buildReverseTable(size: number): Uint32Array {
  if (reverseTableCache.has(size)) {
    return reverseTableCache.get(size)!;
  }
  const table = new Uint32Array(size);
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    let reversed = 0;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | ((i >>> j) & 1);
    }
    table[i] = reversed;
  }
  reverseTableCache.set(size, table);
  return table;
}
