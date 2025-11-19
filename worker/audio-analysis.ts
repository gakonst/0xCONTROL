import FFT from "fft.js";

type AudioContextLike = {
  decodeAudioData(data: ArrayBuffer): Promise<any>;
  close?: () => Promise<void>;
};

type AudioContextConstructorLike = new () => AudioContextLike;

export type WaveformBucket = {
  low: number;
  mid: number;
  high: number;
};

export type WaveformSeries = {
  bucketDurationSeconds: number;
  buckets: WaveformBucket[];
};

export type BeatGrid = {
  startOffsetSeconds: number;
  intervalSeconds: number;
};

export type TrackAnalysisResult = {
  overview: WaveformSeries;
  detail: WaveformSeries;
  bpm: number | null;
  detectedKey: string | null;
  beatGrid: BeatGrid | null;
  durationSeconds: number;
  sampleRate: number;
};

const WINDOW_SIZE = 2048;
const DETAIL_BUCKET_DURATION = 1 / 60; // ~16.6ms detail resolution
const OVERVIEW_TARGET_BUCKETS = 1200;
const LOW_MAX_HZ = 120;
const MID_MAX_HZ = 2500;
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];
const MIN_BPM = 70;
const MAX_BPM = 180;

function getAudioContextCtor(): AudioContextConstructorLike | undefined {
  return (
    (globalThis as { AudioContext?: AudioContextConstructorLike }).AudioContext ||
    (globalThis as { webkitAudioContext?: AudioContextConstructorLike }).webkitAudioContext
  );
}

async function decodeAudioBuffer(arrayBuffer: ArrayBuffer) {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this environment");
  }

  const context = new AudioContextCtor();
  const audioBuffer: any = await context.decodeAudioData(arrayBuffer.slice(0));
  await context.close?.();

  const channels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const channelData = audioBuffer.getChannelData(i);
    const copy = new Float32Array(channelData.length);
    copy.set(channelData);
    channels.push(copy);
  }

  return {
    sampleRate: audioBuffer.sampleRate,
    durationSeconds: audioBuffer.duration,
    channels,
  };
}

function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) {
    return channels[0];
  }

  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) {
      mono[i] += channel[i];
    }
  }

  const scale = 1 / channels.length;
  for (let i = 0; i < length; i++) {
    mono[i] *= scale;
  }
  return mono;
}

function buildHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

function computeBuckets(
  samples: Float32Array,
  sampleRate: number,
  hopSize: number,
): WaveformBucket[] {
  const fft = new FFT(WINDOW_SIZE);
  const input = fft.createComplexArray();
  const output = fft.createComplexArray();
  const window = buildHannWindow(WINDOW_SIZE);
  const nyquist = sampleRate / 2;
  const buckets: WaveformBucket[] = [];

  for (let start = 0; start < samples.length; start += hopSize) {
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const sample = samples[start + i] ?? 0;
      input[2 * i] = sample * window[i];
      input[2 * i + 1] = 0;
    }

    fft.transform(output, input);

    let low = 0;
    let mid = 0;
    let high = 0;

    for (let bin = 0; bin < WINDOW_SIZE / 2; bin++) {
      const re = output[2 * bin];
      const im = output[2 * bin + 1];
      const magnitude = Math.sqrt(re * re + im * im);
      const freq = (bin * sampleRate) / WINDOW_SIZE;
      if (freq <= LOW_MAX_HZ) {
        low += magnitude;
      } else if (freq <= MID_MAX_HZ) {
        mid += magnitude;
      } else if (freq <= nyquist) {
        high += magnitude;
      }
    }

    buckets.push({ low, mid, high });
  }

  return normalizeBuckets(buckets);
}

function normalizeBuckets(buckets: WaveformBucket[]): WaveformBucket[] {
  const maxValues = buckets.reduce(
    (acc, bucket) => {
      acc.low = Math.max(acc.low, bucket.low);
      acc.mid = Math.max(acc.mid, bucket.mid);
      acc.high = Math.max(acc.high, bucket.high);
      return acc;
    },
    { low: 0, mid: 0, high: 0 },
  );

  const epsilon = 1e-6;
  return buckets.map((bucket) => ({
    low: Math.round((bucket.low / (maxValues.low + epsilon)) * 255),
    mid: Math.round((bucket.mid / (maxValues.mid + epsilon)) * 255),
    high: Math.round((bucket.high / (maxValues.high + epsilon)) * 255),
  }));
}

function downsampleBuckets(
  buckets: WaveformBucket[],
  targetCount: number,
): WaveformBucket[] {
  if (buckets.length <= targetCount) {
    return buckets;
  }

  const groupSize = Math.ceil(buckets.length / targetCount);
  const result: WaveformBucket[] = [];

  for (let i = 0; i < buckets.length; i += groupSize) {
    const slice = buckets.slice(i, i + groupSize);
    const aggregate = slice.reduce(
      (acc, bucket) => {
        acc.low += bucket.low;
        acc.mid += bucket.mid;
        acc.high += bucket.high;
        return acc;
      },
      { low: 0, mid: 0, high: 0 },
    );
    const length = slice.length || 1;
    result.push({
      low: Math.round(aggregate.low / length),
      mid: Math.round(aggregate.mid / length),
      high: Math.round(aggregate.high / length),
    });
  }

  return result;
}

function buildEnergyEnvelope(samples: Float32Array, sampleRate: number) {
  const envelopeRate = 200;
  const hop = Math.max(1, Math.floor(sampleRate / envelopeRate));
  const length = Math.floor(samples.length / hop);
  const envelope = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const sample = samples[i * hop + j] ?? 0;
      sum += Math.abs(sample);
    }
    envelope[i] = sum / hop;
  }

  const mean = envelope.reduce((acc, value) => acc + value, 0) / (length || 1);
  for (let i = 0; i < length; i++) {
    envelope[i] = Math.max(0, envelope[i] - mean);
  }

  return { envelope, envelopeRate };
}

function estimateBpm(samples: Float32Array, sampleRate: number): number | null {
  const { envelope, envelopeRate } = buildEnergyEnvelope(samples, sampleRate);
  if (!envelope.length) {
    return null;
  }

  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) * envelopeRate));
  const maxLag = Math.max(minLag + 1, Math.floor((60 / MIN_BPM) * envelopeRate));
  let bestLag = minLag;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i++) {
      sum += envelope[i] * envelope[i + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }

  if (bestScore <= 0) {
    return null;
  }

  let bpm = (60 * envelopeRate) / bestLag;
  while (bpm < MIN_BPM) bpm *= 2;
  while (bpm > MAX_BPM) bpm /= 2;
  return Math.round(bpm);
}

function detectKey(samples: Float32Array, sampleRate: number): string | null {
  const hopSize = WINDOW_SIZE / 2;
  const fft = new FFT(WINDOW_SIZE);
  const input = fft.createComplexArray();
  const output = fft.createComplexArray();
  const window = buildHannWindow(WINDOW_SIZE);
  const chroma = new Float32Array(12);

  for (let start = 0; start < samples.length; start += hopSize) {
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const sample = samples[start + i] ?? 0;
      input[2 * i] = sample * window[i];
      input[2 * i + 1] = 0;
    }
    fft.transform(output, input);

    for (let bin = 1; bin < WINDOW_SIZE / 2; bin++) {
      const re = output[2 * bin];
      const im = output[2 * bin + 1];
      const magnitude = Math.sqrt(re * re + im * im);
      const freq = (bin * sampleRate) / WINDOW_SIZE;
      if (freq < 30 || freq > 5000) continue;
      const midiNumber = Math.round(69 + 12 * Math.log2(freq / 440));
      const pitchClass = ((midiNumber % 12) + 12) % 12;
      chroma[pitchClass] += magnitude;
    }
  }

  const chromaSum = chroma.reduce((acc, value) => acc + value, 0);
  if (chromaSum === 0) {
    return null;
  }
  for (let i = 0; i < chroma.length; i++) {
    chroma[i] /= chromaSum;
  }

  const { keyIndex: majorIndex, score: majorScore } = findBestKey(chroma, MAJOR_PROFILE);
  const { keyIndex: minorIndex, score: minorScore } = findBestKey(chroma, MINOR_PROFILE);

  if (majorScore >= minorScore) {
    return `${NOTE_NAMES[majorIndex]} Major (${CAMELOT_MAJOR[majorIndex]})`;
  }
  return `${NOTE_NAMES[minorIndex]} Minor (${CAMELOT_MINOR[minorIndex]})`;
}

function findBestKey(chroma: Float32Array, profile: number[]) {
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let shift = 0; shift < 12; shift++) {
    let score = 0;
    for (let i = 0; i < 12; i++) {
      const chromaIndex = (i + shift) % 12;
      score += chroma[chromaIndex] * profile[i];
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = shift;
    }
  }
  return { keyIndex: bestIndex, score: bestScore };
}

function computeBeatGrid(
  samples: Float32Array,
  sampleRate: number,
  bpm: number | null,
): BeatGrid | null {
  if (!bpm) {
    return null;
  }
  const { envelope, envelopeRate } = buildEnergyEnvelope(samples, sampleRate);
  if (!envelope.length) {
    return null;
  }

  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > bestValue) {
      bestValue = envelope[i];
      bestIndex = i;
    }
  }

  const rawStartSeconds = bestIndex / envelopeRate;
  const intervalSeconds = 60 / bpm;
  const startOffsetSeconds = rawStartSeconds % intervalSeconds;

  return {
    startOffsetSeconds,
    intervalSeconds,
  };
}

export async function analyzeAudioBuffer(
  arrayBuffer: ArrayBuffer,
): Promise<TrackAnalysisResult> {
  const decoded = await decodeAudioBuffer(arrayBuffer);
  const mono = mixToMono(decoded.channels);

  const detailHop = Math.max(128, Math.floor(decoded.sampleRate * DETAIL_BUCKET_DURATION));
  const detailBuckets = computeBuckets(mono, decoded.sampleRate, detailHop);
  const overviewBuckets = downsampleBuckets(detailBuckets, OVERVIEW_TARGET_BUCKETS);

  const detailBucketDuration = detailHop / decoded.sampleRate;
  const overviewGroupRatio = Math.max(1, Math.ceil(detailBuckets.length / overviewBuckets.length));
  const overviewBucketDuration = detailBucketDuration * overviewGroupRatio;

  const bpm = estimateBpm(mono, decoded.sampleRate);
  const detectedKey = detectKey(mono, decoded.sampleRate);
  const beatGrid = computeBeatGrid(mono, decoded.sampleRate, bpm);

  return {
    overview: {
      bucketDurationSeconds: overviewBucketDuration,
      buckets: overviewBuckets,
    },
    detail: {
      bucketDurationSeconds: detailBucketDuration,
      buckets: detailBuckets,
    },
    bpm,
    detectedKey,
    beatGrid,
    durationSeconds: decoded.durationSeconds,
    sampleRate: decoded.sampleRate,
  };
}
