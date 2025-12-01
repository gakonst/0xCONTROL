import { useCallback, useEffect, useRef, useState } from "react";

import { updateTrackAnnotation } from "@/data/annotations";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";

type PendingEntry = { timeoutId: ReturnType<typeof setTimeout>; note: string };

type UseAnnotationsResult = {
  annotations: Record<string, TrackAnnotation>;
  handleAnnotationChange: (
    trackId: string,
    partial: Partial<TrackAnnotation>,
  ) => void;
  flushAllPendingNoteUpdates: () => void;
};

export function useAnnotations(tracks: Track[]): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<Record<string, TrackAnnotation>>(
    {},
  );
  const pendingNoteSavesRef = useRef(new Map<string, PendingEntry>());

  useEffect(() => {
    if (!tracks.length) return;
    setAnnotations((previous) => {
      let hasChanges = false;
      const next = { ...previous };
      for (const track of tracks) {
        if (!track.annotation) continue;
        if (next[track.id]) continue;
        next[track.id] = track.annotation;
        hasChanges = true;
      }
      return hasChanges ? next : previous;
    });
  }, [tracks]);

  const persistAnnotation = useCallback(async (trackId: string, patch: Partial<TrackAnnotation>) => {
    try {
      await updateTrackAnnotation(trackId, patch);
    } catch (error) {
      console.error("Failed to save annotation", error);
    }
  }, []);

  const flushAllPendingNoteUpdates = useCallback(() => {
    const pendingEntries = pendingNoteSavesRef.current;
    for (const [trackId, entry] of pendingEntries.entries()) {
      clearTimeout(entry.timeoutId);
      const normalizedNote = entry.note.length > 0 ? entry.note : null;
      void persistAnnotation(trackId, { note: normalizedNote });
      pendingEntries.delete(trackId);
    }
  }, [persistAnnotation]);

  useEffect(() => () => {
    flushAllPendingNoteUpdates();
  }, [flushAllPendingNoteUpdates]);

  const scheduleNoteSave = useCallback(
    (trackId: string, note: string) => {
      const pendingEntries = pendingNoteSavesRef.current;
      const existing = pendingEntries.get(trackId);
      if (existing) {
        clearTimeout(existing.timeoutId);
      }

      const timeoutId = setTimeout(() => {
        pendingEntries.delete(trackId);
        const normalizedNote = note.length > 0 ? note : null;
        void persistAnnotation(trackId, { note: normalizedNote });
      }, 2000);

      pendingEntries.set(trackId, { timeoutId, note });
    },
    [persistAnnotation],
  );

  const handleAnnotationChange = useCallback(
    (trackId: string, partial: Partial<TrackAnnotation>) => {
      if (!trackId) return;

      const existingAnnotation = annotations[trackId];
      const previousColor = existingAnnotation?.color ?? null;
      const previousNote = existingAnnotation?.note ?? "";

      setAnnotations((previous) => {
        const currentValue = previous[trackId] ?? {};
        const updated: TrackAnnotation = { ...currentValue };

        if ("color" in partial) {
          const nextColor = partial.color ?? null;
          if (nextColor) {
            updated.color = nextColor;
          } else {
            delete updated.color;
          }
        }

        if ("note" in partial) {
          const nextNote = partial.note ?? "";
          if (nextNote.length > 0) {
            updated.note = nextNote;
          } else {
            delete updated.note;
          }
        }

        const hasColor = "color" in updated;
        const hasNote = "note" in updated;

        if (!hasColor && !hasNote) {
          if (!(trackId in previous)) {
            return previous;
          }
          const { [trackId]: _removed, ...rest } = previous;
          return rest;
        }

        return {
          ...previous,
          [trackId]: updated,
        };
      });

      if (Object.prototype.hasOwnProperty.call(partial, "color")) {
        const nextColor = partial.color ?? null;
        if (nextColor !== previousColor) {
          void persistAnnotation(trackId, { color: nextColor });
        }
      }

      if (Object.prototype.hasOwnProperty.call(partial, "note")) {
        const nextNote = partial.note ?? "";
        if (nextNote !== previousNote) {
          scheduleNoteSave(trackId, nextNote);
        }
      }
    },
    [annotations, persistAnnotation, scheduleNoteSave],
  );

  return { annotations, handleAnnotationChange, flushAllPendingNoteUpdates };
}
