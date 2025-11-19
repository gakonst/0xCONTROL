import type { Track } from "@/data/tracks";
import type { Playlist } from "@/types/playlists";

type MockPlaylistBlueprint = Omit<Playlist, "trackIds">;

const PLAYLIST_BLUEPRINTS: MockPlaylistBlueprint[] = [
  {
    id: "field-intel",
    title: "Field Intel",
    description: "Late-night rhythms that keep the monitors glowing after midnight mission briefs.",
    mood: "Afterhours drive",
    tags: ["percussion", "sub-heavy", "warehouse"],
    createdAt: "2025-11-07T02:00:00Z",
    updatedAt: "2025-11-12T04:00:00Z",
    accentFrom: "#ff3d81",
    accentTo: "#f9b16e",
    folderPath: ["Ops", "Field Kits"],
  },
  {
    id: "sunrise-bloom",
    title: "Sunrise Bloom",
    description: "Balearic-leaning selections for the comedown rehearsal when the lights finally come up.",
    mood: "Warm + euphoric",
    tags: ["balearic", "organic", "uplift"],
    createdAt: "2025-11-01T09:20:00Z",
    updatedAt: "2025-11-08T10:30:00Z",
    accentFrom: "#4facfe",
    accentTo: "#00f2fe",
    folderPath: ["Mood Arcs"],
  },
  {
    id: "control-tests",
    title: "Control Tests",
    description: "Fresh uploads that still need a spin at full gain. QA the arrangements before release.",
    mood: "QA queue",
    tags: ["wip", "rough mix"],
    createdAt: "2025-10-28T15:45:00Z",
    updatedAt: "2025-11-05T18:15:00Z",
    accentFrom: "#a18cd1",
    accentTo: "#fbc2eb",
    folderPath: ["Ops", "QA"]
  },
];

export function buildMockPlaylists(tracks: Track[]): Playlist[] {
  if (!tracks.length) {
    return [];
  }

  const bucketSize = Math.max(
    1,
    Math.ceil(tracks.length / PLAYLIST_BLUEPRINTS.length),
  );

  return PLAYLIST_BLUEPRINTS.map((blueprint, index) => {
    const start = index * bucketSize;
    const bucket = tracks.slice(start, start + bucketSize);
    if (!bucket.length) {
      return null;
    }

    return {
      ...blueprint,
      trackIds: bucket.map((track) => track.id),
    };
  }).filter(Boolean) as Playlist[];
}
