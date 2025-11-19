import { useEffect, useState } from "react";
import { LibraryHeader } from "@/components/library-header";

const URL_PATTERN = /^https?:\/\//i;
const SOUNDCLOUD_PATTERN = /soundcloud\.com/i;
const YOUTUBE_PATTERN = /(?:youtube\.com|youtu\.be)/i;

type PanelMode = "idle" | "playlist" | "download";
type MetadataState = "idle" | "loading" | "ready" | "error";

type EmbedMetadata = {
  title: string;
  authorName: string;
  providerName: string;
  thumbnailUrl: string;
  originalUrl: string;
};

export function PlaylistCreatePanel() {
  const [entry, setEntry] = useState("");
  const [metadata, setMetadata] = useState<EmbedMetadata | null>(null);
  const [metadataState, setMetadataState] = useState<MetadataState>("idle");

  const trimmedValue = entry.trim();
  const isUrl = URL_PATTERN.test(trimmedValue);
  const isSoundCloud = isUrl && SOUNDCLOUD_PATTERN.test(trimmedValue);
  const isYouTube = isUrl && YOUTUBE_PATTERN.test(trimmedValue);
  const mode: PanelMode = trimmedValue
    ? isUrl
      ? "download"
      : "playlist"
    : "idle";
  const canPreviewMetadata = mode === "download" && (isSoundCloud || isYouTube);
  const previewThumbnailUrl =
    metadataState === "ready" && metadata?.thumbnailUrl
      ? metadata.thumbnailUrl
      : "";
  const previewTitle =
    metadataState === "ready" && metadata
      ? metadata.title
      : "Track title";
  const previewAuthor =
    metadataState === "ready" && metadata
      ? metadata.authorName
      : "";
  const previewProvider =
    metadataState === "ready" && metadata
      ? `via ${metadata.providerName}`
      : "";

  useEffect(() => {
    if (!canPreviewMetadata) {
      setMetadata(null);
      setMetadataState("idle");
      return;
    }

    const controller = new AbortController();
    const endpoint = isSoundCloud
      ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trimmedValue)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(trimmedValue)}`;

    setMetadataState("loading");
    setMetadata(null);

    fetch(endpoint, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load metadata");
        }
        return response.json();
      })
      .then((data) => {
        setMetadata({
          title: data.title ?? "Untitled",
          authorName: data.author_name ?? data.provider_name ?? "Unknown",
          providerName:
            data.provider_name ?? (isSoundCloud ? "SoundCloud" : "YouTube"),
          thumbnailUrl: data.thumbnail_url ?? "",
          originalUrl: trimmedValue,
        });
        setMetadataState("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }
        setMetadataState("error");
      });

    return () => controller.abort();
  }, [canPreviewMetadata, isSoundCloud, trimmedValue]);

  const primaryButtonStateClasses =
    mode === "idle"
      ? "border-white/25 text-white/40 cursor-not-allowed"
      : mode === "playlist"
        ? "border-white/80 text-white"
        : "border-emerald-200 text-emerald-100";

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_rgba(3,7,18,0.95))] shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur">
      <LibraryHeader
        title="New"
        stats="Create a playlist or download a track"
        search={{
          id: "new-entry",
          value: entry,
          placeholder: "Playlist or TrackID",
          label: "Name or URL",
          onChange: setEntry,
        }}
        onClearSearch={() => setEntry("")}
        showClearButton={false}
      />

      <div className="flex-1 overflow-auto px-3.5 pb-6 text-white md:px-5">
        <div className="flex items-center gap-3 rounded border border-white/10 bg-black/50 px-4 py-4">
          {previewThumbnailUrl ? (
            <img
              src={previewThumbnailUrl}
              alt="Preview thumbnail"
              className="h-20 w-20 flex-shrink-0 border border-white/10 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center border border-dashed border-white/20" />
          )}
          <div className="text-sm text-white">
            <p className="font-semibold leading-tight">{previewTitle}</p>
            <p className="text-xs uppercase tracking-[0.2rem] text-white/60">
              {previewAuthor || "\u00A0"}
            </p>
            <p className="text-[0.65rem] text-white/50">
              {previewProvider || "\u00A0"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 md:flex-row md:justify-end">
          <button
            type="button"
            disabled={mode === "idle"}
            className={`border px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15rem] ${primaryButtonStateClasses}`}
          >
            {mode === "download" ? "Download" : "Create"}
          </button>
        </div>
      </div>
    </section>
  );
}
