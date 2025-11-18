export type BandFrame = {
  bass: number;
  melody: number;
  voice: number;
  hats: number;
};

export type WaveData = {
  sampleRate: number;
  frames: BandFrame[];
  stats?: BandStats;
};

export type BandStats = {
  bassMax: number;
  melodyMax: number;
  voiceMax: number;
  hatsMax: number;
};
