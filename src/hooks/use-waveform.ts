import { useQuery } from "@tanstack/react-query";

import { fetchWaveformAnalysis } from "@/lib/waveform-client";
import type { WaveformAnalysis } from "@/lib/waveform";

export function useWaveform(trackId?: string | null) {
  return useQuery<WaveformAnalysis | null>({
    queryKey: ["waveform", trackId ?? "none"],
    queryFn: () => fetchWaveformAnalysis(trackId ?? ""),
    enabled: Boolean(trackId),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
