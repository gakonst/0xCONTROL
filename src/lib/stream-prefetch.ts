import { getTrackStreamUrl } from "@/data/tracks";

const DEFAULT_PREVIEW_SEGMENTS = 3;
const MAX_PLAYLIST_DEPTH = 2;

type PrefetchOptions = {
  signal?: AbortSignal;
  maxSegments?: number;
};

type PrefetchMode = "preview" | "full";

const completedPreview = new Set<string>();
const completedFull = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export function prefetchStreamPreview(
  trackId: string,
  options: PrefetchOptions = {},
): Promise<void> {
  return prefetchStream(trackId, {
    mode: "preview",
    maxSegments: options.maxSegments ?? DEFAULT_PREVIEW_SEGMENTS,
    signal: options.signal,
  });
}

export function prefetchStreamFull(
  trackId: string,
  options: Omit<PrefetchOptions, "maxSegments"> = {},
): Promise<void> {
  return prefetchStream(trackId, { mode: "full", signal: options.signal });
}

async function prefetchStream(
  trackId: string,
  options: { mode: PrefetchMode; maxSegments?: number; signal?: AbortSignal },
): Promise<void> {
  if (!trackId || typeof window === "undefined") return;

  if (options.mode === "preview" && completedPreview.has(trackId)) return;
  if (options.mode === "full" && completedFull.has(trackId)) return;

  const inFlightKey = `${options.mode}:${trackId}`;
  const existing = inFlight.get(inFlightKey);
  if (existing) return existing;

  const task = (async () => {
    const playlistUrl = getTrackStreamUrl(trackId);
    if (!isLikelyPlaylistUrl(playlistUrl)) return;
    const segments = await resolvePlaylistSegments(playlistUrl, options.signal);
    if (!segments.length) return;

    const targets =
      options.mode === "preview"
        ? segments.slice(0, options.maxSegments ?? DEFAULT_PREVIEW_SEGMENTS)
        : segments;

    await prefetchUrls(targets, options.signal);
  })();

  inFlight.set(inFlightKey, task);

  try {
    await task;
    if (options.mode === "preview") {
      completedPreview.add(trackId);
    } else {
      completedFull.add(trackId);
    }
  } finally {
    inFlight.delete(inFlightKey);
  }
}

async function resolvePlaylistSegments(
  playlistUrl: string,
  signal?: AbortSignal,
  depth = 0,
): Promise<string[]> {
  const text = await fetchPlaylistText(playlistUrl, signal);
  if (!text || !text.includes("#EXTM3U")) return [];

  const parsed = parsePlaylist(text, playlistUrl);
  if (parsed.variants.length > 0 && depth < MAX_PLAYLIST_DEPTH) {
    return resolvePlaylistSegments(parsed.variants[0], signal, depth + 1);
  }

  return parsed.segments;
}

async function fetchPlaylistText(
  playlistUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetch(playlistUrl, { signal, cache: "force-cache" });
    if (!response.ok) return null;
    return response.text();
  } catch (error) {
    if (signal?.aborted) return null;
    console.warn("Stream prefetch: playlist fetch failed", error);
    return null;
  }
}

function parsePlaylist(text: string, baseUrl: string): {
  segments: string[];
  variants: string[];
} {
  const segments: string[] = [];
  const variants: string[] = [];
  const lines = text.split(/\r?\n/);
  let expectVariant = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        expectVariant = true;
      }

      const mapMatch = line.match(/#EXT-X-MAP:.*URI=\"([^\"]+)\"/i);
      if (mapMatch?.[1]) {
        segments.push(resolveUrl(mapMatch[1], baseUrl));
      }

      continue;
    }

    if (expectVariant) {
      variants.push(resolveUrl(line, baseUrl));
      expectVariant = false;
      continue;
    }

    if (line.endsWith(".m3u8")) {
      variants.push(resolveUrl(line, baseUrl));
      continue;
    }

    segments.push(resolveUrl(line, baseUrl));
  }

  return { segments, variants };
}

function resolveUrl(path: string, baseUrl: string): string {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

function isLikelyPlaylistUrl(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.href);
    return resolved.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return url.toLowerCase().includes(".m3u8");
  }
}

async function prefetchUrls(
  urls: string[],
  signal?: AbortSignal,
): Promise<void> {
  for (const url of urls) {
    if (signal?.aborted) return;
    try {
      const response = await fetch(url, { signal, cache: "force-cache" });
      if (!response.ok) continue;
      await response.arrayBuffer();
    } catch (error) {
      if (signal?.aborted) return;
      console.warn("Stream prefetch: segment fetch failed", error);
    }
  }
}
