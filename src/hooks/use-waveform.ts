import { useQuery } from "@tanstack/react-query";

import { fetchWaveformAnalysis } from "@/lib/waveform-client";
import type { WaveformAnalysis } from "@/lib/waveform";

type UseWaveformOptions = {
  /** allow callers to disable fetching when the row is off-screen */
  enabled?: boolean;
};

export function useWaveform(trackId?: string | null, options: UseWaveformOptions = {}) {
  const enabled = Boolean(trackId) && (options.enabled ?? true);

  return useQuery<WaveformAnalysis | null>({
    queryKey: ["waveform", trackId ?? "none"],
    queryFn: () => fetchWaveformAnalysis(trackId ?? ""),
    enabled,
    staleTime: 1000 * 60 * 60 * 24, // keep warm all day
    gcTime: 1000 * 60 * 60 * 24 * 7, // retain for a week
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
