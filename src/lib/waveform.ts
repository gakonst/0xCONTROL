export type FrequencyBands = {
  low: number;
  mid: number;
  high: number;
};

export type WaveformSegment = {
  amplitude: number;
  bands: FrequencyBands;
};

const MAX_SEGMENTS = 640;
const SEGMENT_SIZE = 1024; // Must be a power of two for FFT
const LOW_MAX_HZ = 200;
const MID_MAX_HZ = 2000;

export type WaveformAnalysis = {
  segments: WaveformSegment[];
  durationSeconds: number;
};

export function extractWaveformFromAudioBuffer(
  buffer: AudioBuffer,
): WaveformAnalysis {
  const channelData =
    buffer.numberOfChannels > 0
      ? buffer.getChannelData(0)
      : new Float32Array(buffer.length);
  const samplesPerSegment = SEGMENT_SIZE;
  const totalSegments = Math.min(
    MAX_SEGMENTS,
    Math.ceil(channelData.length / samplesPerSegment),
  );
  const segments: WaveformSegment[] = [];
  let maxAmplitude = 0;

  for (let index = 0; index < totalSegments; index++) {
    const start = index * samplesPerSegment;
    if (start >= channelData.length) break;
    const end = Math.min(start + samplesPerSegment, channelData.length);
    const segmentSlice = channelData.subarray(start, end);
    const paddedSegment = new Float32Array(samplesPerSegment);
    paddedSegment.set(segmentSlice);

    const amplitude = computeRms(paddedSegment);
    const bands = computeFrequencyBands(paddedSegment, buffer.sampleRate);
    segments.push({ amplitude, bands });
    maxAmplitude = Math.max(maxAmplitude, amplitude);
  }

  const normalizedSegments = segments.map((segment) => ({
    amplitude: maxAmplitude > 0 ? segment.amplitude / maxAmplitude : 0,
    bands: segment.bands,
  }));

  return {
    segments: normalizedSegments,
    durationSeconds: buffer.duration,
  };
}

function computeRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / samples.length);
}

function computeFrequencyBands(
  samples: Float32Array,
  sampleRate: number,
): FrequencyBands {
  const magnitudes = performFftMagnitudes(samples);
  const binHz = sampleRate / samples.length;
  let low = 0;
  let mid = 0;
  let high = 0;

  for (let bin = 1; bin < magnitudes.length; bin++) {
    const frequency = bin * binHz;
    const magnitude = magnitudes[bin];
    if (frequency < LOW_MAX_HZ) {
      low += magnitude;
    } else if (frequency < MID_MAX_HZ) {
      mid += magnitude;
    } else {
      high += magnitude;
    }
  }

  const total = low + mid + high || 1;
  return {
    low: low / total,
    mid: mid / total,
    high: high / total,
  };
}

function performFftMagnitudes(samples: Float32Array): Float32Array {
  const n = samples.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  real.set(samples);
  const reverseTable = buildReverseTable(n);

  for (let i = 0; i < n; i++) {
    const j = reverseTable[i];
    if (j > i) {
      const tempReal = real[i];
      real[i] = real[j];
      real[j] = tempReal;
      const tempImag = imag[i];
      imag[i] = imag[j];
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
          cosAngle * real[oddIndex] - sinAngle * imag[oddIndex];
        const tempImag =
          sinAngle * real[oddIndex] + cosAngle * imag[oddIndex];

        real[oddIndex] = real[evenIndex] - tempReal;
        imag[oddIndex] = imag[evenIndex] - tempImag;
        real[evenIndex] += tempReal;
        imag[evenIndex] += tempImag;
      }
    }
  }

  const magnitudes = new Float32Array(n / 2);
  for (let i = 0; i < magnitudes.length; i++) {
    const re = real[i];
    const im = imag[i];
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
