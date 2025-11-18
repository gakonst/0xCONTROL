import { useQuery } from "@tanstack/react-query";

import { getTrackUrl } from "@/data/tracks";
import {
  extractWaveformFromAudioBuffer,
  type WaveformAnalysis,
} from "@/lib/waveform";

type WaveformQueryResult = {
  data: WaveformAnalysis | null;
  isLoading: boolean;
  isError: boolean;
};

export function useWaveform(trackId?: string): WaveformQueryResult {
  const { data, isPending, isError } = useQuery({
    queryKey: ["waveform", trackId],
    enabled: Boolean(trackId) && typeof window !== "undefined",
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      if (!trackId) {
        throw new Error("Missing track id");
      }

      const trackUrl = getTrackUrl(trackId);
      const response = await fetch(trackUrl, { signal });
      if (!response.ok) {
        throw new Error(`Track fetch failed with ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const AudioContextCtor =
        window.AudioContext || (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("AudioContext is not supported");
      }
      const audioContext = new AudioContextCtor();
      try {
        const audioBuffer = await decodeAudioData(audioContext, arrayBuffer);
        return extractWaveformFromAudioBuffer(audioBuffer);
      } finally {
        await audioContext.close();
      }
    },
  });

  return {
    data: data ?? null,
    isLoading: isPending,
    isError,
  };
}

async function decodeAudioData(
  context: BaseAudioContext,
  buffer: ArrayBuffer,
): Promise<AudioBuffer> {
  if (context.decodeAudioData.length === 1) {
    return context.decodeAudioData(buffer);
  }

  return new Promise((resolve, reject) => {
    context.decodeAudioData(
      buffer.slice(0),
      (decoded) => resolve(decoded),
      (error) => reject(error),
    );
  });
}
