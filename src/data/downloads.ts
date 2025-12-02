import { buildApiUrl } from "@/lib/api";

export type DownloadJob = {
  id: string;
  source: string;
  tool: string;
  status: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  output_path?: string | null;
  message?: string | null;
  progress?: number;
};

export type DownloadPayload = {
  source: string;
  tool?: "yt-dlp" | "spotdl" | "scdl";
  output?: string;
};

export async function startDownload(payload: DownloadPayload): Promise<DownloadJob> {
  const response = await fetch(buildApiUrl("/api/download"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Download request failed with status ${response.status}`);
  }

  return (await response.json()) as DownloadJob;
}

export async function fetchDownloadProgress(
  jobId?: string,
): Promise<DownloadJob | DownloadJob[]> {
  const url = jobId
    ? buildApiUrl(`/api/progress/${encodeURIComponent(jobId)}`)
    : buildApiUrl("/api/progress");
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Progress request failed with status ${response.status}`);
  }

  return (await response.json()) as DownloadJob | DownloadJob[];
}
