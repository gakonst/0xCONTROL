import type { BandFrame, WaveData } from "@/types/waveform";

const CACHE = new Map<string, WaveData>();

export function getMockWaveform(trackId: string): WaveData {
  if (CACHE.has(trackId)) {
    return CACHE.get(trackId)!;
  }

  const waveData = buildMockWaveData(trackId);
  CACHE.set(trackId, waveData);
  return waveData;
}

function buildMockWaveData(seed: string): WaveData {
  const frameCount = 1600;
  const sampleRate = 120;
  const frames: BandFrame[] = [];
  const rng = createRngFromString(seed);

  for (let index = 0; index < frameCount; index++) {
    const progress = index / frameCount;
    const introEnergy = Math.max(0, 1 - progress * 1.3);
    const breakdownEnergy = Math.max(0, 0.6 - Math.abs(progress - 0.3));
    const dropEnergy = Math.exp(-Math.pow((progress - 0.55) * 7, 2));
    const outroEnergy = Math.pow(Math.max(0, progress - 0.5), 1.5);

    const bass = clamp(
      0.15 * introEnergy +
        0.35 * breakdownEnergy +
        1.4 * dropEnergy +
        0.25 * outroEnergy +
        rng() * 0.08,
    );
    const melody = clamp(
      0.8 * introEnergy +
        0.4 * breakdownEnergy +
        0.2 * dropEnergy +
        0.6 * outroEnergy +
        Math.sin(progress * Math.PI * 4) * 0.15 +
        rng() * 0.08,
    );
    const voice = clamp(
      0.3 * introEnergy +
        0.5 * breakdownEnergy +
        0.35 * dropEnergy +
        0.4 * outroEnergy +
        Math.sin(progress * Math.PI * 3) * 0.1 +
        rng() * 0.05,
    );
    const hats = clamp(
      0.2 * introEnergy +
        0.15 * breakdownEnergy +
        0.3 * dropEnergy +
        0.9 * outroEnergy +
        rng() * 0.25,
    );

    frames.push({ bass, melody, voice, hats });
  }

  return {
    sampleRate,
    frames,
    stats: frames.reduce(
      (stats, frame) => ({
        bassMax: Math.max(stats.bassMax, frame.bass),
        melodyMax: Math.max(stats.melodyMax, frame.melody),
        voiceMax: Math.max(stats.voiceMax, frame.voice),
        hatsMax: Math.max(stats.hatsMax, frame.hats),
      }),
      { bassMax: 0, melodyMax: 0, voiceMax: 0, hatsMax: 0 },
    ),
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function createRngFromString(seed: string) {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return function mulberry32() {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    const t = (hash ^= hash >>> 16) >>> 0;
    return (t & 0xfffffff) / 0x10000000;
  };
}
