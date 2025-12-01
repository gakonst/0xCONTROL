import { useEffect, useState } from "react";

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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const activeColorOption =
    COLOR_OPTIONS.find((option) => option.id === selectedColor) ?? null;

  useEffect(() => {
    setIsPaletteOpen(false);
  }, [track?.id, hasSelection]);

  const handleColorSelect = (colorId: TrackColor | null) => {
    onChange({ color: colorId });
    setIsPaletteOpen(false);
  };

  const containerClasses = "relative bg-transparent px-0 py-0 text-white";

  return (
    <section className={cn("w-full", className)} aria-label="Track annotations">
      <div className={containerClasses}>
        <div className="flex items-center gap-3">
          <div className="relative flex w-[48px] justify-center pl-2">
            <label htmlFor="track-note-color" className="sr-only">
              Track color
            </label>
            <button
              id="track-note-color"
              type="button"
              onClick={() => hasSelection && setIsPaletteOpen((prev) => !prev)}
              className={cn(
                "h-[26px] w-[26px] border border-white/30 transition",
                activeColorOption?.swatchClass ?? "bg-white/10",
                !hasSelection ? "cursor-not-allowed opacity-30" : "",
              )}
              aria-haspopup="listbox"
              aria-expanded={isPaletteOpen}
              aria-label="Choose track color"
              disabled={!hasSelection}
            />
            {isPaletteOpen && hasSelection && (
              <div className="absolute bottom-[calc(100%+0.25rem)] left-full ml-2 z-[99] w-32 border border-white/20 bg-black/90 p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => handleColorSelect(null)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-xs uppercase tracking-tight text-white/70 hover:bg-white/10"
                >
                  None
                </button>
                {COLOR_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleColorSelect(option.id)}
                    className="flex w-full items-center justify-between px-2 py-1 text-left text-xs uppercase tracking-tight text-white hover:bg-white/10"
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        "h-3 w-3 border border-white/40",
                        option.swatchClass,
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 pl-2">
            <label htmlFor="track-note-input" className="sr-only">
              Track note
            </label>
            <input
              id="track-note-input"
              type="text"
              disabled={!hasSelection}
              placeholder="add note"
              value={noteValue}
              onChange={(event) => onChange({ note: event.target.value })}
              className="h-8 w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
