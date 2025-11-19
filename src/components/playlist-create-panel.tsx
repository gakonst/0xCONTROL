import { Download, Link2, ListPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

  const downloadCommand = useMemo(() => {
    if (!isUrl) {
      return "";
    }

    if (isSoundCloud) {
      return `scdl -l "${trimmedValue}" --path downloads/soundcloud`;
    }

    return `yt-dlp "${trimmedValue}" -P downloads/youtube`;
  }, [isSoundCloud, isUrl, trimmedValue]);

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

  const headline =
    mode === "playlist"
      ? "Draft Playlist"
      : mode === "download"
        ? "Download Command"
        : "Start Something New";

  const supportingCopy =
    mode === "playlist"
      ? "Looks like a playlist title. When wiring is ready, we'll launch a structured draft workflow from here."
      : mode === "download"
        ? isSoundCloud
          ? "SoundCloud link detected. We'll queue it through scdl with artwork + metadata in the downloads staging area."
          : "This reads like a YouTube (or general) link. We'll prep a yt-dlp command so it lands next to the crates."
        : "Give us a playlist name or paste a YouTube/SoundCloud URL. We'll adapt automatically.";

  const playlistButtonStateClasses =
    mode === "playlist"
      ? "border-white/80 text-white"
      : "border-white/25 text-white/40 cursor-not-allowed";
  const downloadButtonStateClasses =
    mode === "download"
      ? "border-emerald-200 text-emerald-100"
      : "border-white/25 text-white/40 cursor-not-allowed";

  return (
    <section className="flex h-full flex-col gap-6 border border-dashed border-white/15 bg-black/40 px-6 py-8 text-white">
      <div className="flex items-center gap-3">
        {mode === "download" ? (
          <Download className="h-10 w-10 text-emerald-200" />
        ) : (
          <ListPlus className="h-10 w-10 text-white" />
        )}
        <div>
          <p className="text-xs uppercase tracking-[0.2rem] text-white/60">New</p>
          <h2 className="text-2xl font-semibold leading-tight">{headline}</h2>
          <p className="text-sm text-white/70">{supportingCopy}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.15rem] text-white/60">
        <label htmlFor="new-entry">Name or URL</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
            <Link2 className="h-4 w-4" />
          </span>
          <input
            id="new-entry"
            type="text"
            placeholder="Loose playlist title or https://…"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            className="w-full border border-white/30 bg-transparent px-10 py-3 text-base tracking-normal text-white placeholder:text-white/40 focus:border-white/70 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article
          className={`flex flex-col justify-between border px-4 py-5 text-left ${mode === "playlist" ? "border-white/70 bg-white/5" : "border-white/15 bg-black/30"}`}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2rem] text-white/60">
              <ListPlus className="h-4 w-4" />
              Playlist Draft
            </div>
            <p className="text-sm text-white/80">
              {mode === "playlist"
                ? `We'll scaffold a playlist tentatively titled "${trimmedValue || ""}" and wait for tracks.`
                : "Type any non-link text to shape a playlist draft."}
            </p>
          </div>
          <button
            type="button"
            disabled={mode !== "playlist"}
            className={`mt-4 border px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15rem] ${playlistButtonStateClasses}`}
          >
            Draft Playlist
          </button>
        </article>

        <article
          className={`flex flex-col justify-between border px-4 py-5 text-left ${mode === "download" ? "border-emerald-200/80 bg-emerald-500/5" : "border-white/15 bg-black/30"}`}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2rem] text-white/60">
              <Download className="h-4 w-4" />
              Downloader
            </div>
            {mode === "download" ? (
              <>
                <p className="text-sm text-white/80">
                  {isSoundCloud
                    ? "scdl will honor the playlist/track context so we keep creator metadata."
                    : "yt-dlp grabs audio+art so we can drop it straight into crates."}
                </p>
                <pre className="overflow-x-auto rounded border border-white/10 bg-black/60 px-3 py-2 text-xs text-emerald-100">
                  <code>{downloadCommand}</code>
                </pre>
                {canPreviewMetadata && (
                  <div className="space-y-2 rounded border border-white/10 bg-black/50 px-3 py-3 text-left">
                    {metadataState === "loading" && (
                      <p className="text-xs uppercase tracking-[0.2rem] text-white/60">
                        Fetching embed metadata…
                      </p>
                    )}
                    {metadataState === "error" && (
                      <p className="text-xs text-red-200">
                        Could not load metadata automatically. You can still queue the
                        download and tag later.
                      </p>
                    )}
                    {metadataState === "ready" && metadata && (
                      <div className="flex items-center gap-3">
                        {metadata.thumbnailUrl ? (
                          <img
                            src={metadata.thumbnailUrl}
                            alt="Preview thumbnail"
                            className="h-16 w-16 flex-shrink-0 border border-white/10 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center border border-dashed border-white/20 text-xs uppercase text-white/50">
                            No Art
                          </div>
                        )}
                        <div className="text-sm text-white">
                          <p className="font-semibold leading-tight">{metadata.title}</p>
                          <p className="text-xs uppercase tracking-[0.2rem] text-white/60">
                            {metadata.authorName}
                          </p>
                          <p className="text-[0.65rem] text-white/50">
                            via {metadata.providerName}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-white/70">
                Paste a link that begins with http:// or https:// to preview the
                command we will queue up.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={mode !== "download"}
            className={`mt-4 border px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15rem] ${downloadButtonStateClasses}`}
          >
            Queue Download
          </button>
        </article>
      </div>
    </section>
  );
}
