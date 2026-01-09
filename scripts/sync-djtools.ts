import { homedir } from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".flac", ".wav"]);

type UploadItem = {
  filePath: string;
  trackId: string;
  playlistTitle?: string;
};

type Options = {
  uploadUrl: string;
  uploadBulkUrl: string;
  playlistsDir: string;
  tracksDir: string;
  includeLibrary: boolean;
  dryRun: boolean;
  concurrency: number;
  bulk: boolean;
  chunkSize: number;
  playlistPath?: string;
};

const DEFAULT_UPLOAD_URL =
  process.env.TRACKS_UPLOAD_URL ?? "http://localhost:8787/api/tracks/upload";
const DEFAULT_UPLOAD_BULK_URL =
  process.env.TRACKS_UPLOAD_BULK_URL ??
  "http://localhost:8787/api/tracks/upload/bulk";

const DEFAULT_PLAYLISTS_DIR = path.join(homedir(), ".djtools", "playlists");
const DEFAULT_TRACKS_DIR = path.join(homedir(), ".djtools", "tracks");

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    uploadUrl: DEFAULT_UPLOAD_URL,
    uploadBulkUrl: DEFAULT_UPLOAD_BULK_URL,
    playlistsDir: DEFAULT_PLAYLISTS_DIR,
    tracksDir: DEFAULT_TRACKS_DIR,
    includeLibrary: false,
    dryRun: false,
    concurrency: 1,
    bulk: true,
    chunkSize: 2,
    playlistPath: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--endpoint") {
      opts.uploadUrl = argv[i + 1] ?? opts.uploadUrl;
      i += 1;
      continue;
    }
    if (arg === "--bulk-endpoint") {
      opts.uploadBulkUrl = argv[i + 1] ?? opts.uploadBulkUrl;
      i += 1;
      continue;
    }
    if (arg === "--playlists-dir") {
      opts.playlistsDir = argv[i + 1] ?? opts.playlistsDir;
      i += 1;
      continue;
    }
    if (arg === "--tracks-dir") {
      opts.tracksDir = argv[i + 1] ?? opts.tracksDir;
      i += 1;
      continue;
    }
    if (arg === "--playlist-path") {
      opts.playlistPath = argv[i + 1] ?? opts.playlistPath;
      i += 1;
      continue;
    }
    if (arg === "--include-library") {
      opts.includeLibrary = true;
      continue;
    }
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (arg === "--concurrency") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) {
        opts.concurrency = Math.floor(next);
        i += 1;
        continue;
      }
    }
    if (arg === "--all-concurrent") {
      opts.concurrency = 0;
      continue;
    }
    if (arg === "--bulk") {
      opts.bulk = true;
      continue;
    }
    if (arg === "--chunk-size") {
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) {
        opts.chunkSize = Math.floor(next);
        i += 1;
        continue;
      }
    }
  }

  return opts;
}

async function collectAudioFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectAudioFiles(fullPath);
      results.push(...nested);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (AUDIO_EXTENSIONS.has(ext)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function buildUploadList(opts: Options): Promise<UploadItem[]> {
  const uploads: UploadItem[] = [];
  const seenTrackIds = new Set<string>();

  if (opts.playlistPath) {
    const playlistTitle = path.basename(opts.playlistPath).trim();
    if (!playlistTitle) {
      return uploads;
    }

    const files = await collectAudioFiles(opts.playlistPath);
    for (const filePath of files) {
      const trackId = path.basename(filePath);
      uploads.push({ filePath, trackId, playlistTitle });
      seenTrackIds.add(trackId);
    }

    return uploads;
  }

  const playlistDirs = await readdir(opts.playlistsDir, { withFileTypes: true });
  for (const dir of playlistDirs) {
    if (!dir.isDirectory() || dir.name.startsWith(".")) {
      continue;
    }

    const playlistTitle = dir.name.trim();
    if (!playlistTitle) {
      continue;
    }

    const playlistPath = path.join(opts.playlistsDir, dir.name);
    const files = await collectAudioFiles(playlistPath);

    for (const filePath of files) {
      const trackId = path.basename(filePath);
      uploads.push({ filePath, trackId, playlistTitle });
      seenTrackIds.add(trackId);
    }
  }

  if (opts.includeLibrary) {
    const libraryFiles = await collectAudioFiles(opts.tracksDir);
    for (const filePath of libraryFiles) {
      const trackId = path.basename(filePath);
      if (seenTrackIds.has(trackId)) {
        continue;
      }
      uploads.push({ filePath, trackId });
    }
  }

  return uploads;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  if (limit <= 0 || limit >= items.length) {
    return Promise.all(items.map((item, index) => worker(item, index)));
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}

async function uploadTrack(item: UploadItem, opts: Options): Promise<string> {
  if (opts.dryRun) {
    return `[dry-run] ${item.trackId} -> ${item.playlistTitle ?? "(no playlist)"}`;
  }

  const form = new FormData();
  form.set("trackId", item.trackId);
  form.set("file", Bun.file(item.filePath));
  if (item.playlistTitle) {
    form.set("playlist", item.playlistTitle);
  }

  const response = await fetch(opts.uploadUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    return `${item.trackId}: error ${response.status} ${text}`;
  }

  const payload = (await response.json()) as { status?: string };
  return `${item.trackId}: ${payload.status ?? "ok"}`;
}

function chunkItems(items: UploadItem[], chunkSize: number): UploadItem[][] {
  const chunks: UploadItem[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function uploadChunk(
  items: UploadItem[],
  playlistTitle: string | undefined,
  opts: Options,
): Promise<string[]> {
  const trackIds = items.map((item) => item.trackId);
  console.log(`bulk:start[${trackIds.join(" | ")}]`);

  if (opts.dryRun) {
    return items.map(
      (item) => `[dry-run] ${item.trackId} -> ${playlistTitle ?? "(no playlist)"}`,
    );
  }

  const form = new FormData();

  for (const item of items) {
    form.append("files", Bun.file(item.filePath));
  }

  form.set("trackIds", JSON.stringify(trackIds));
  if (playlistTitle) {
    form.set("playlist", playlistTitle);
  }

  const response = await fetch(opts.uploadBulkUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`bulk:done[${trackIds.join(" | ")}]`);
    return trackIds.map((trackId) => `${trackId}: error ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{ trackId?: string; status?: string; error?: string }>;
  };

  const results = payload.results ?? [];
  if (!results.length) {
    console.log(`bulk:done[${trackIds.join(" | ")}]`);
    return trackIds.map((trackId) => `${trackId}: ok`);
  }

  const mapped = results.map((result, index) => {
    const trackId = result.trackId ?? trackIds[index] ?? "unknown";
    if (result.error) {
      return `${trackId}: error ${result.error}`;
    }
    return `${trackId}: ${result.status ?? "ok"}`;
  });

  console.log(`bulk:done[${trackIds.join(" | ")}]`);
  return mapped;
}

async function uploadAll(uploads: UploadItem[], opts: Options) {
  if (!opts.bulk) {
    const results = await runWithConcurrency(
      uploads,
      opts.concurrency,
      async (item) => uploadTrack(item, opts),
    );
    for (const line of results) {
      console.log(line);
    }
    return;
  }

  const groups = new Map<string, UploadItem[]>();
  for (const item of uploads) {
    const key = item.playlistTitle ?? "__no_playlist__";
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  const chunkJobs: Array<{ playlistTitle?: string; items: UploadItem[] }> = [];
  for (const [key, items] of groups.entries()) {
    const playlistTitle = key === "__no_playlist__" ? undefined : key;
    for (const chunk of chunkItems(items, opts.chunkSize)) {
      chunkJobs.push({ playlistTitle, items: chunk });
    }
  }

  const results = await runWithConcurrency(
    chunkJobs,
    opts.concurrency,
    async (job) => uploadChunk(job.items, job.playlistTitle, opts),
  );

  for (const chunkResults of results) {
    for (const line of chunkResults) {
      console.log(line);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const uploads = await buildUploadList(opts);

  console.log(`Found ${uploads.length} tracks to sync.`);

  await uploadAll(uploads, opts);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
