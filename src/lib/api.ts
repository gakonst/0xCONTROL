const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

const NORMALIZED_API_BASE_URL =
  !RAW_API_BASE_URL || RAW_API_BASE_URL === "/"
    ? ""
    : RAW_API_BASE_URL.replace(/\/+$/, "");

const isBrowser = typeof window !== "undefined";

function shouldIgnoreLocalBase(): boolean {
  if (!NORMALIZED_API_BASE_URL || !isBrowser) return false;

  try {
    const url = new URL(NORMALIZED_API_BASE_URL, window.location.origin);
    const baseHost = url.hostname;
    const isLocalBase = baseHost === "localhost" || baseHost === "127.0.0.1";
    const isLocalPage = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // If the bundle was built with a localhost API base but we're running on a
    // non-localhost origin (e.g. production), fall back to same-origin APIs.
    return isLocalBase && !isLocalPage;
  } catch (err) {
    console.warn("Unable to parse API base URL", err);
    return false;
  }
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const effectiveBase = shouldIgnoreLocalBase() ? "" : NORMALIZED_API_BASE_URL;

  if (!effectiveBase) {
    return normalizedPath;
  }

  return `${effectiveBase}${normalizedPath}`;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(buildApiUrl(path), {
    ...init,
    credentials: init.credentials ?? "include",
  });
}
