const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

const NORMALIZED_API_BASE_URL =
  !RAW_API_BASE_URL || RAW_API_BASE_URL === "/"
    ? ""
    : RAW_API_BASE_URL.replace(/\/+$/, "");

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!NORMALIZED_API_BASE_URL) {
    return normalizedPath;
  }
  return `${NORMALIZED_API_BASE_URL}${normalizedPath}`;
}
