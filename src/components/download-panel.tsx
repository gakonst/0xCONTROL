import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDownloadProgress,
  startDownload,
  type DownloadJob,
  type DownloadPayload,
} from "@/data/downloads";

function formatDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString();
}

export function DownloadPanel() {
  const queryClient = useQueryClient();
  const [source, setSource] = useState("");
  const [tool, setTool] = useState<DownloadPayload["tool"] | "">("");

  const progressQuery = useQuery({
    queryKey: ["downloads"],
    queryFn: async () => {
      const response = await fetchDownloadProgress();
      return Array.isArray(response) ? response : [response];
    },
    refetchInterval: 4000,
  });

  const mutation = useMutation({
    mutationFn: startDownload,
    onSuccess: () => {
      void progressQuery.refetch();
      setSource("");
    },
  });

  const jobs = useMemo(() => progressQuery.data ?? [], [progressQuery.data]);

  useEffect(() => {
    const hasCompleted = jobs.some(
      (job) => job.status === "completed" || job.status === "skipped",
    );
    if (hasCompleted) {
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    }
  }, [jobs, queryClient]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!source.trim()) return;
    mutation.mutate({ source, tool: tool || undefined });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm shadow">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-white">Universal downloader</p>
          <p className="text-xs text-white/70">
            Kick off yt-dlp, spotdl or scdl jobs and follow their progress.
          </p>
        </div>
        {mutation.isPending ? (
          <span className="text-xs text-white/70">Starting…</span>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2 md:flex-row">
        <input
          className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          placeholder="Paste a YouTube/Spotify/SoundCloud link"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
        <select
          className="rounded border border-white/10 bg-black/40 px-2 py-2 text-sm text-white focus:border-white/30"
          value={tool}
          onChange={(event) =>
            setTool(event.target.value as DownloadPayload["tool"] | "")
          }
        >
          <option value="">Auto</option>
          <option value="yt-dlp">yt-dlp</option>
          <option value="spotdl">spotdl</option>
          <option value="scdl">scdl</option>
        </select>
        <button
          type="submit"
          className="rounded bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          disabled={!source.trim() || mutation.isPending}
        >
          Start download
        </button>
      </form>

      <div className="space-y-2">
        {jobs.length === 0 ? (
          <p className="text-xs text-white/60">No downloads yet.</p>
        ) : (
          jobs.map((job) => <DownloadJobRow key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}

function DownloadJobRow({ job }: { job: DownloadJob }) {
  const statusColor =
    job.status === "completed"
      ? "text-green-400"
      : job.status === "failed"
        ? "text-red-400"
        : job.status === "skipped"
          ? "text-yellow-300"
          : "text-blue-300";

  return (
    <div className="rounded border border-white/10 bg-black/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-white">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-white/80">
              {job.tool}
            </span>
            <span className={statusColor}>{job.status}</span>
          </div>
          <p className="break-all text-white/80">{job.source}</p>
          <p className="text-white/60">
            {job.message ?? "waiting"}
            {typeof job.progress === "number" && !Number.isNaN(job.progress)
              ? ` • ${job.progress.toFixed(1)}%`
              : ""}
          </p>
          {job.output_path ? (
            <p className="text-white/60">Saved to: {job.output_path}</p>
          ) : null}
        </div>
        <div className="text-right text-[11px] text-white/60">
          <div>queued {formatDate(job.created_at)}</div>
          {job.started_at ? <div>start {formatDate(job.started_at)}</div> : null}
          {job.finished_at ? <div>done {formatDate(job.finished_at)}</div> : null}
        </div>
      </div>
    </div>
  );
}
