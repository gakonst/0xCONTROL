import { useQuery } from "@tanstack/react-query";

import { fetchTrackWaveform, type TrackWaveformResponse } from "@/data/tracks";

export function useTrackWaveform(trackId: string | null | undefined) {
  return useQuery<TrackWaveformResponse, Error>({
    queryKey: ["waveform", trackId],
    queryFn: ({ signal }) => {
      if (!trackId) {
        throw new Error("trackId is required");
      }
      return fetchTrackWaveform(trackId, signal);
    },
    enabled: Boolean(trackId),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
