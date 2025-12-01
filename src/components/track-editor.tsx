import { TrackNotesEditor } from "./track-notes-editor";
import { cn } from "@/lib/utils";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";

type TrackEditorProps = {
  track?: Track;
  annotation?: TrackAnnotation;
  onChange: (update: Partial<TrackAnnotation>) => void;
  className?: string;
};

export function TrackEditor({
  track,
  annotation,
  onChange,
  className,
}: TrackEditorProps) {
  const baseClass = "border-b border-white/10 px-4 py-2";

  return (
    <TrackNotesEditor
      track={track}
      annotation={annotation}
      onChange={onChange}
      className={cn(baseClass, className)}
    />
  );
}
