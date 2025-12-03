import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LibraryHeader } from "@/components/library-header";
import { createPlaylist } from "@/data/playlists";
import {
  fetchDownloadProgress,
  startDownload,
  type DownloadJob,
  type DownloadPayload,
} from "@/data/downloads";
import type { Playlist } from "@/types/playlists";

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

type PlaylistCreatePanelProps = {
  onPlaylistCreated?: (playlist: Playlist) => void;
};

export function PlaylistCreatePanel({ onPlaylistCreated }: PlaylistCreatePanelProps) {
  const queryClient = useQueryClient();
  const [entry, setEntry] = useState("");
  const [metadata, setMetadata] = useState<EmbedMetadata | null>(null);
  const [metadataState, setMetadataState] = useState<MetadataState>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ["download-progress", activeJobId],
    queryFn: async () => {
      if (!activeJobId) throw new Error("No job id");
      const response = await fetchDownloadProgress(activeJobId);
      return response as DownloadJob;
    },
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
    const status = (query.state.data as DownloadJob | undefined)?.status;
    const terminal = status === "completed" || status === "failed" || status === "skipped";
    return terminal ? false : 3000;
    },
  });

  // When a download finishes successfully, refresh the catalog so the new track shows up without manual reload.
  useEffect(() => {
    const status = jobQuery.data?.status;
    if (status === "completed" || status === "skipped") {
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    }
  }, [jobQuery.data?.status, queryClient]);

  const downloadMutation = useMutation({
    mutationFn: (payload: DownloadPayload) => startDownload(payload),
  });

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

  useEffect(() => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  }, [entry]);

  const handleCreatePlaylist = async () => {
    if (mode !== "playlist" || !trimmedValue) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const playlist = await createPlaylist({ title: trimmedValue });
      onPlaylistCreated?.(playlist);
      setEntry("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create playlist. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = () => {
    if (mode === "playlist") {
      void handleCreatePlaylist();
      return;
    }
    if (mode === "download" && trimmedValue) {
      setErrorMessage(null);
      setStatusMessage(null);
      downloadMutation.mutate(
        { source: trimmedValue },
        {
          onSuccess: (job) => {
            setStatusMessage(`Download started (job ${job.id})`);
            setActiveJobId(job.id);
            setEntry("");
            setMetadata(null);
            setMetadataState("idle");
          },
          onError: (error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to start download. Please try again.";
            setErrorMessage(message);
          },
        },
      );
    }
  };

  const isPrimaryDisabled =
    mode === "idle" ||
    (mode === "playlist" && (isSubmitting || !trimmedValue.length)) ||
    (mode === "download" && (downloadMutation.isPending || !trimmedValue.length));

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background shadow-[0_25px_120px_rgba(3,7,18,0.85)] backdrop-blur">
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
            disabled={isPrimaryDisabled}
            onClick={handlePrimaryAction}
            className={`border px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15rem] ${primaryButtonStateClasses} ${isPrimaryDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {mode === "download"
              ? downloadMutation.isPending
                ? "Starting..."
                : "Download"
              : isSubmitting
                ? "Creating..."
                : "Create"}
          </button>
          <div className="flex flex-col gap-1 text-left md:text-right">
            {statusMessage && (
              <p className="text-xs text-emerald-200">{statusMessage}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-rose-200">{errorMessage}</p>
            )}
          </div>
        </div>

        {activeJobId ? (
          <DownloadJobStatus job={jobQuery.data} isLoading={jobQuery.isLoading} />
        ) : null}
      </div>
    </section>
  );
}

function DownloadJobStatus({
  job,
  isLoading,
}: {
  job?: DownloadJob;
  isLoading: boolean;
}) {
  if (!job) {
    return (
      <div className="mt-3 rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/70">
        {isLoading ? "Loading download status…" : "Waiting for status"}
      </div>
    );
  }

  const statusColor =
    job.status === "completed"
      ? "text-emerald-300"
      : job.status === "failed"
        ? "text-rose-300"
        : job.status === "skipped"
          ? "text-amber-200"
          : "text-blue-300";

  return (
    <div className="mt-3 rounded border border-white/10 bg-black/40 px-3 py-3 text-xs text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
            {job.tool}
          </span>
          <span className={statusColor}>{job.status}</span>
        </div>
        <div className="text-[10px] text-white/60">job {job.id}</div>
      </div>
      <p className="mt-1 break-all text-white/80">{job.source}</p>
      <p className="text-white/60">
        {job.message ?? "processing"}
        {typeof job.progress === "number" && !Number.isNaN(job.progress)
          ? ` • ${job.progress.toFixed(1)}%`
          : ""}
      </p>
      {job.output_path ? (
        <p className="text-white/60">Output: {job.output_path}</p>
      ) : null}
    </div>
  );
}
