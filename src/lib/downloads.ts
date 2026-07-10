import { buildApiUrl } from "@/lib/api";

export function getTrackDownloadUrl(trackId: string): string {
  return buildApiUrl(`/api/tracks/${encodeURIComponent(trackId)}/download`);
}

export function getPlaylistDownloadUrl(playlistId: string): string {
  return buildApiUrl(`/api/playlists/${encodeURIComponent(playlistId)}/download`);
}

export function startBrowserDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 0);
}
