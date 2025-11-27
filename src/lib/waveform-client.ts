import { buildApiUrl } from "@/lib/api";
import type { WaveformAnalysis } from "@/lib/waveform";

/**
 * Fetch a precomputed waveform (and BPM metadata) for a track by id/path.
 * Returns null when the worker cannot serve the analysis.
 */
export async function fetchWaveformAnalysis(
  trackId: string,
): Promise<WaveformAnalysis | null> {
  if (!trackId) return null;

  const apiUrl = buildApiUrl("/api/analyze");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: trackId }),
    });

    if (!response.ok) {
      console.warn("waveform analyze failed", response.status);
      return null;
    }

    const payload = (await response.json()) as {
      waveform?: WaveformAnalysis["waveform"];
      bpm?: number | null;
      beatOffsetSeconds?: number | null;
    };

    if (payload?.waveform && Array.isArray(payload.waveform.bars)) {
      return {
        waveform: payload.waveform,
        bpm: payload.bpm ?? null,
        beatOffsetSeconds: payload.beatOffsetSeconds ?? null,
      } satisfies WaveformAnalysis;
    }
  } catch (error) {
    console.warn("waveform analyze threw", error);
  }

  return null;
}
