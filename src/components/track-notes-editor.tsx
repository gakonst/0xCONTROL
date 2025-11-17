import { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";
import type { TrackAnnotation, TrackColor } from "@/types/annotations";

const COLOR_OPTIONS: Array<{
  id: TrackColor;
  label: string;
  swatchClass: string;
}> = [
  { id: "red", label: "Red", swatchClass: "bg-red-500" },
  { id: "blue", label: "Blue", swatchClass: "bg-blue-500" },
  { id: "pink", label: "Pink", swatchClass: "bg-pink-500" },
  { id: "cyan", label: "Cyan", swatchClass: "bg-cyan-400" },
];

type TrackNotesEditorProps = {
  track?: Track;
  annotation?: TrackAnnotation;
  onChange: (update: Partial<TrackAnnotation>) => void;
  className?: string;
};

export function TrackNotesEditor({
  track,
  annotation,
  onChange,
  className,
}: TrackNotesEditorProps) {
  const selectedColor = annotation?.color ?? null;
  const noteValue = annotation?.note ?? "";
  const hasSelection = Boolean(track);

  return (
    <section
      className={cn(
        "flex w-full items-center gap-3 border-t border-white/15 bg-[rgba(10,10,10,0.95)] px-3 py-2 text-sm text-white",
        className,
      )}
      aria-label="Track annotations"
    >
      <div className="grid h-[40px] w-[40px] grid-cols-2 grid-rows-2 gap-0.5">
        {COLOR_OPTIONS.map((option) => {
          const isActive = option.id === selectedColor;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!hasSelection}
              onClick={() =>
                onChange({
                  color: isActive ? null : option.id,
                })
              }
              className={cn(
                "transition",
                option.swatchClass,
                isActive
                  ? "ring-2 ring-white ring-offset-2 ring-offset-black"
                  : "",
                !hasSelection ? "cursor-not-allowed opacity-30" : "",
              )}
            />
          );
        })}
      </div>

      <div className="flex min-h-[48px] flex-1 items-center border border-white/10 bg-black/90 px-3">
        <textarea
          rows={1}
          disabled={!hasSelection}
          placeholder={track ? "Add a note…" : "Select a track"}
          value={noteValue}
          onChange={(event) => onChange({ note: event.target.value })}
          className="h-full w-full resize-none bg-transparent text-base leading-snug text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    </section>
  );
}
