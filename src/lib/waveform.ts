import FFT from "fft.js";

export type WaveformBar = {
  /** 0..1 height multiplier for the bar */
  amplitude: number;
  /** normalized RGB components already blended toward white for “air” energy */
  color: { r: number; g: number; b: number };
  /** 0..1 white energy amount used for overlays */
  whiteness: number;
};

export type WaveformData = {
  bars: WaveformBar[];
  durationSeconds: number;
  sampleRate: number;
};

export type WaveformAnalysisOptions = {
  /** number of vertical bars to render across the waveform */
  resolution?: number;
  /** fft window size used when estimating per-band energy */
  fftSize?: number;
};

const DEFAULT_RESOLUTION = 1800;
const DEFAULT_FFT_SIZE = 2048;

// Tuned toward Rekordbox-style coloring: lows up to ~220 Hz, mids to ~2 kHz,
// melody/treble up to ~9 kHz, with “air” above that reserved for white.
const BANDS = {
  bass: { min: 20, max: 220 },
  voice: { min: 220, max: 2000 },
  melody: { min: 2000, max: 9000 },
  air: { min: 9000, max: 18000 },
} as const;

type BandKey = keyof typeof BANDS;

export async function analyzeWaveformFromBuffer(
  audioBuffer: AudioBuffer,
  options: WaveformAnalysisOptions = {},
): Promise<WaveformData> {
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;

  if (!Number.isInteger(resolution) || resolution <= 0) {
    throw new Error("resolution must be a positive integer");
  }

  const mono = mixToMono(audioBuffer);
  const hop = Math.max(1, Math.floor(mono.length / resolution));
  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  const signal = fft.createComplexArray();
  const hann = buildHannWindow(fftSize);

  const bandsPerBar: Array<Record<BandKey, number> & { total: number }> = [];

  for (let barIndex = 0; barIndex < resolution; barIndex += 1) {
    const center = barIndex * hop + Math.floor(hop / 2);
    const start = center - Math.floor(fftSize / 2);

    for (let i = 0; i < fftSize; i += 1) {
      const sourceIndex = start + i;
      const value = sourceIndex >= 0 && sourceIndex < mono.length
        ? mono[sourceIndex] * hann[i]
        : 0;
      signal[2 * i] = value; // real part
      signal[2 * i + 1] = 0; // imag part
    }

    fft.realTransform(spectrum, signal);
    fft.completeSpectrum(spectrum);

    const energies = accumulateBandEnergy(
      spectrum,
      audioBuffer.sampleRate,
      fftSize,
    );
    bandsPerBar.push(energies);
  }

  const maxima = bandsPerBar.reduce(
    (acc, band) => {
      acc.total = Math.max(acc.total, band.total);
      acc.bass = Math.max(acc.bass, band.bass);
      acc.voice = Math.max(acc.voice, band.voice);
      acc.melody = Math.max(acc.melody, band.melody);
      acc.air = Math.max(acc.air, band.air);
      return acc;
    },
    { total: 0, bass: 0, voice: 0, melody: 0, air: 0 },
  );

  const bars: WaveformBar[] = bandsPerBar.map((band) => {
    const amplitude = normalize(band.total, maxima.total, 0.7);
    const bass = normalize(band.bass, maxima.bass, 0.6);
    const voice = normalize(band.voice, maxima.voice, 0.6);
    const melody = normalize(band.melody, maxima.melody, 0.55); // lift highs/blue
    const air = normalize(band.air, maxima.air, 0.8);

    // Cap whiteness so it doesn’t wash out red; only a thin sheen.
    const whiteness = clamp(Math.pow(air, 1.0) * 0.35, 0, 0.35);

    return {
      amplitude,
      color: {
        // Slight boosts to red/green/blue to restore vividness after whitening.
        r: clamp(bass * 1.2 * (1 - whiteness) + whiteness),
        g: clamp(voice * 1.05 * (1 - whiteness) + whiteness),
        b: clamp(melody * 1.25 * (1 - whiteness) + whiteness),
      },
      whiteness,
    };
  });

  return {
    bars,
    durationSeconds: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
  };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i];
    }
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < length; i += 1) {
    mono[i] *= scale;
  }
  return mono;
}

function buildHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  const factor = Math.PI * 2 / (size - 1);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return window;
}

function accumulateBandEnergy(
  spectrum: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): Record<BandKey, number> & { total: number } {
  const Nyquist = sampleRate / 2;
  const binSize = Nyquist / (fftSize / 2);
  const energy: Record<BandKey, number> & { total: number } = {
    bass: 0,
    voice: 0,
    melody: 0,
    air: 0,
    total: 0,
  };

  for (let bin = 0; bin < fftSize / 2; bin += 1) {
    const re = spectrum[2 * bin];
    const im = spectrum[2 * bin + 1];
    const magnitude = Math.sqrt(re * re + im * im);
    const freq = bin * binSize;

    for (const bandKey of Object.keys(BANDS) as BandKey[]) {
      const band = BANDS[bandKey];
      if (freq >= band.min && freq < band.max) {
        energy[bandKey] += magnitude;
        break;
      }
    }
    energy.total += magnitude;
  }

  return energy;
}

function normalize(value: number, max: number, gamma = 1): number {
  if (max <= 0) return 0;
  const ratio = clamp(value / max);
  return Math.pow(ratio, gamma);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
