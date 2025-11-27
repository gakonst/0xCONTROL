export function parseDurationToSeconds(duration?: string | null): number {
  if (!duration) return 0;
  const parts = duration.split(":").map((value) => Number(value) || 0);
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  return 0;
}

export function formatSecondsToClock(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return "0:00";
  }
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
