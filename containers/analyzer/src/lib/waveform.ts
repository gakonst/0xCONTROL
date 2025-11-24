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

export type PresetKey =
  | "reference-clean"
  | "vivid-studio"
  | "crisp-micro"
  | "balanced-film"
  | "darkroom-contrast"
  | "soft-pastel"
  | "chrome-accurate"
  | "gridliner"
  | "smoothed-hifi"
  | "airy-highlight";

export type PresetConfig = {
  resolution: number;
  fftSize: number;
  amplitudeGamma: number;
  saturationBoost: number; // e.g. 0.12 = +12%
  brightnessBoost: number; // 0.1 = +10%
  alphaCap?: number;
  highsCap?: number;
  smoothingWindow?: number;
};

// Keep in sync with scripts/preprocess-waveform.ts
export const PRESETS: Record<PresetKey, PresetConfig> = {
  "reference-clean": {
    resolution: 5000,
    fftSize: 4096,
    amplitudeGamma: 0.9,
    saturationBoost: 10.0,
    brightnessBoost: 0.05,
  },
  "vivid-studio": {
    resolution: 2000,
    fftSize: 4096,
    amplitudeGamma: 1,
    saturationBoost: 0.12,
    brightnessBoost: 0.05,
    highsCap: 0.25,
  },
  "crisp-micro": {
    resolution: 3200,
    fftSize: 2048,
    amplitudeGamma: 1,
    saturationBoost: 0,
    brightnessBoost: 0,
    alphaCap: 0.7,
  },
  "balanced-film": {
    resolution: 1800,
    fftSize: 4096,
    amplitudeGamma: 1,
    saturationBoost: -0.08,
    brightnessBoost: 0.1,
  },
  "darkroom-contrast": {
    resolution: 2400,
    fftSize: 4096,
    amplitudeGamma: 1,
    saturationBoost: -0.12,
    brightnessBoost: -0.05,
    highsCap: 0.2,
  },
  "soft-pastel": {
    resolution: 2000,
    fftSize: 2048,
    amplitudeGamma: 1.1,
    saturationBoost: -0.25,
    brightnessBoost: 0.2,
  },
  "chrome-accurate": {
    resolution: 2200,
    fftSize: 4096,
    amplitudeGamma: 1,
    saturationBoost: 0.05,
    brightnessBoost: 0.05,
    highsCap: 0.25,
  },
  "gridliner": {
    resolution: 2600,
    fftSize: 2048,
    amplitudeGamma: 0.95,
    saturationBoost: 0,
    brightnessBoost: 0,
  },
  "smoothed-hifi": {
    resolution: 2200,
    fftSize: 2048,
    amplitudeGamma: 1,
    saturationBoost: 0,
    brightnessBoost: 0,
    smoothingWindow: 5,
  },
  "airy-highlight": {
    resolution: 2100,
    fftSize: 4096,
    amplitudeGamma: 1,
    saturationBoost: 0,
    brightnessBoost: 0.05,
    highsCap: 0.2,
  },
};

const DEFAULT_RESOLUTION = 1800;
const DEFAULT_FFT_SIZE = 2048;

// Tuned toward Rekordbox-style coloring: lows up to ~220 Hz, mids to ~2 kHz,
// melody/treble up to ~9 kHz, with “air” above that reserved for white.
const BANDS = {
  bass: { min: 20, max: 220 },
  voice: { min: 250, max: 2200 },
  melody: { min: 2200, max: 9000 },
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

    // Nudge voice upward and melody slightly downward to bring back greens.
    const voiceWeight = 1.15;
    const melodyWeight = 1.2;
    const voice = normalize(band.voice * voiceWeight, maxima.voice * voiceWeight, 0.6);
    const melody = normalize(band.melody * melodyWeight, maxima.melody * melodyWeight, 0.5);
    const air = normalize(band.air, maxima.air, 0.9);

    // Lower whiteness contribution so colors stay saturated.
    const whiteness = clamp(Math.pow(air, 1.05) * 0.2, 0, 0.22);

    return {
      amplitude,
      color: {
        r: clamp(bass * 1.18 * (1 - whiteness) + whiteness * 0.8),
        g: clamp(voice * 1.22 * (1 - whiteness) + whiteness * 0.8),
        b: clamp(melody * 1.38 * (1 - whiteness) + whiteness),
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

export function applyPresetToWaveform(
  waveform: WaveformData,
  preset: PresetConfig,
): WaveformData {
  const gamma = preset.amplitudeGamma ?? 1;
  const bars = waveform.bars.map((bar) => {
    const amp = Math.pow(bar.amplitude, gamma);
    let { r, g, b } = bar.color;
    let whiteness = bar.whiteness ?? 0;

    if (preset.highsCap !== undefined) {
      whiteness = Math.min(whiteness, preset.highsCap);
    }

    if (preset.saturationBoost !== 0 || preset.brightnessBoost !== 0) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const s2 = clamp01(s * (1 + preset.saturationBoost));
      const l2 = clamp01(l * (1 + preset.brightnessBoost));
      ({ r, g, b } = hslToRgb(h, s2, l2));
    }

    r = clamp01(r * (1 - whiteness) + whiteness);
    g = clamp01(g * (1 - whiteness) + whiteness);
    b = clamp01(b * (1 - whiteness) + whiteness);

    if (preset.alphaCap !== undefined) {
      r = Math.min(r, preset.alphaCap);
      g = Math.min(g, preset.alphaCap);
      b = Math.min(b, preset.alphaCap);
    }

    return { ...bar, amplitude: amp, color: { r, g, b }, whiteness };
  });

  if (preset.smoothingWindow && preset.smoothingWindow > 1) {
    const w = preset.smoothingWindow;
    for (let i = 0; i < bars.length; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -w; k <= w; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < bars.length) {
          sum += bars[idx].amplitude;
          count += 1;
        }
      }
      bars[i].amplitude = sum / Math.max(1, count);
    }
  }

  return { ...waveform, bars };
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

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r, g, b };
}
