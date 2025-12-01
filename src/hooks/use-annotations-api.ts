import { useAnnotations } from "@/hooks/use-annotations";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";

export type AnnotationsApi = {
  state: Record<string, TrackAnnotation>;
  update: (trackId: string, update: Partial<TrackAnnotation>) => void;
  flush: () => void;
};

export function useAnnotationsApi(tracks: Track[]): AnnotationsApi {
  const { annotations, handleAnnotationChange, flushAllPendingNoteUpdates } = useAnnotations(tracks);

  return {
    state: annotations,
    update: handleAnnotationChange,
    flush: flushAllPendingNoteUpdates,
  };
}
