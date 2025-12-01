import { useEffect } from "react";

type UseKeyboardShortcutsOptions = {
  enabled: boolean;
  hasTrack: boolean;
  onTogglePlay: () => void;
};

export function useKeyboardShortcuts({
  enabled,
  hasTrack,
  onTogglePlay,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const isSpace =
        event.code === "Space" ||
        event.key === " " ||
        event.key?.toLowerCase() === "spacebar";
      if (!isSpace) return;
      if (event.defaultPrevented) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }

      if (!hasTrack) return;
      event.preventDefault();
      onTogglePlay();
    };

    window.addEventListener("keydown", handleSpaceToggle);
    return () => {
      window.removeEventListener("keydown", handleSpaceToggle);
    };
  }, [enabled, hasTrack, onTogglePlay]);
}
