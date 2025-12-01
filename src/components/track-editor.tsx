import { TrackNotesEditor } from "./track-notes-editor";
import { cn } from "@/lib/utils";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";

type TrackEditorProps = {
  track?: Track;
  annotation?: TrackAnnotation;
  onChange: (update: Partial<TrackAnnotation>) => void;
  className?: string;
  /**
   * Default keeps the floating panel styling; inline matches the rail/footer usage.
   */
  variant?: "default" | "inline";
};

export function TrackEditor({
  track,
  annotation,
  onChange,
  className,
  variant = "inline",
}: TrackEditorProps) {
  const baseClass =
    variant === "inline"
      ? "border-b border-white/10 px-4 py-2"
      : "px-3 py-1";

  return (
    <TrackNotesEditor
      track={track}
      annotation={annotation}
      onChange={onChange}
      variant={variant}
      className={cn(baseClass, className)}
    />
  );
}
