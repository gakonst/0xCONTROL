import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, Download } from "lucide-react";

import { startBrowserDownload } from "@/lib/downloads";

type DownloadNotice = {
  id: number;
  label: string;
  phase: "starting" | "started" | "error";
};

type DownloadContextValue = {
  startDownload: (url: string, label: string) => void;
};

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadStatusProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<DownloadNotice | null>(null);
  const nextId = useRef(0);
  const activeUrls = useRef(new Set<string>());

  const startDownload = useCallback(async (url: string, label: string) => {
    if (activeUrls.current.has(url)) return;
    activeUrls.current.add(url);
    nextId.current += 1;
    const id = nextId.current;
    let started = false;
    setNotice({ id, label, phase: "starting" });
    try {
      const response = await fetch(url, {
        method: "HEAD",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const message =
          response.status === 413
            ? "This playlist exceeds the 4 GB ZIP export limit."
            : response.status === 409
              ? "This playlist is empty."
              : response.status === 401
                ? "Your session expired. Reload and unlock the library again."
                : response.status === 404
                  ? "The requested audio is not available."
                  : "The download could not be prepared.";
        setNotice({ id, label: message, phase: "error" });
        return;
      }
      const missing = Number(response.headers.get("X-0xControl-Missing-Tracks") ?? 0);
      startBrowserDownload(url);
      started = true;
      setNotice({
        id,
        label:
          missing > 0
            ? `${label} · ${missing} unavailable track${missing === 1 ? "" : "s"} listed in the ZIP`
            : label,
        phase: "started",
      });
    } catch {
      setNotice({
        id,
        label: "The library could not be reached. Check your connection and retry.",
        phase: "error",
      });
    } finally {
      if (started) {
        window.setTimeout(() => activeUrls.current.delete(url), 5000);
      } else {
        activeUrls.current.delete(url);
      }
    }
  }, []);

  useEffect(() => {
    if (!notice || notice.phase === "starting") return;
    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const value = useMemo(() => ({ startDownload }), [startDownload]);

  return (
    <DownloadContext.Provider value={value}>
      {children}
      <div
        className={`pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex justify-center px-4 transition ${notice ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <div className="flex max-w-sm items-center gap-3 border border-[hsl(var(--stroke-strong))] bg-[hsl(var(--surface-elevated))] px-4 py-3 text-sm text-[hsl(var(--text))] shadow-2xl">
            <span className="flex h-8 w-8 items-center justify-center border border-white/15 bg-[hsl(var(--brand)/0.14)] text-[hsl(var(--brand))]">
              {notice.phase === "starting" ? (
                <Download className="h-4 w-4 animate-pulse" />
              ) : notice.phase === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">
                {notice.phase === "starting"
                  ? "Preparing download"
                  : notice.phase === "error"
                    ? "Download unavailable"
                    : "Download started"}
              </span>
              <span className="block truncate text-xs text-[hsl(var(--text-muted))]">
                {notice.label}
              </span>
            </span>
          </div>
        )}
      </div>
    </DownloadContext.Provider>
  );
}

export function useDownloads(): DownloadContextValue {
  const value = useContext(DownloadContext);
  if (!value) {
    throw new Error("useDownloads must be used inside DownloadStatusProvider");
  }
  return value;
}
