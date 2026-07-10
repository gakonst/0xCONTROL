import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Loader2, LockKeyhole, RefreshCw } from "lucide-react";

import { buildApiUrl } from "@/lib/api";
import { Button, Surface } from "@/components/ui/primitives";

type AuthState = "checking" | "authenticated" | "signedOut" | "offline";

type SessionResponse = {
  authenticated?: boolean;
  configured?: boolean;
  error?: string;
};

const SESSION_HINT_KEY = "0xcontrol-authenticated-tab";

function hasSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SESSION_HINT_KEY) === "1";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const startedAuthenticated = hasSessionHint();
  const sessionHintRef = useRef(startedAuthenticated);
  const [state, setState] = useState<AuthState>(
    startedAuthenticated ? "authenticated" : "checking",
  );
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    if (!sessionHintRef.current) setState("checking");
    setError(null);
    try {
      const response = await fetch(buildApiUrl("/api/auth/session"), {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as SessionResponse;
      setConfigured(payload.configured !== false);
      if (response.ok && payload.authenticated) {
        window.sessionStorage.setItem(SESSION_HINT_KEY, "1");
        sessionHintRef.current = true;
        setState("authenticated");
      } else {
        window.sessionStorage.removeItem(SESSION_HINT_KEY);
        sessionHintRef.current = false;
        setState("signedOut");
      }
    } catch {
      setState(sessionHintRef.current ? "authenticated" : "offline");
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl("/api/auth/session"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => ({}))) as SessionResponse;
      setConfigured(payload.configured !== false);
      if (response.ok && payload.authenticated) {
        window.sessionStorage.setItem(SESSION_HINT_KEY, "1");
        sessionHintRef.current = true;
        setPassword("");
        setState("authenticated");
      } else {
        setError(
          payload.error ??
            (response.status === 503
              ? "Authentication is not configured on the Worker."
              : "That passcode did not work."),
        );
      }
    } catch {
      setError("Could not reach 0xControl. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "authenticated") return <>{children}</>;

  if (state === "checking") {
    return (
      <main
        className="h-[100dvh] bg-[#010308]"
        aria-label="Checking library session"
      />
    );
  }

  return (
    <main className="safe-top safe-bottom flex h-[100dvh] items-center justify-center bg-[hsl(var(--canvas))] px-4 text-[hsl(var(--text))]">
      <Surface className="w-full max-w-sm p-5">
        <div className="flex h-14 w-14 items-center justify-center border border-white/20 bg-white/5 text-[hsl(var(--brand))]">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-[-0.035em]">0xControl</h1>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--text-muted))]">
          {state === "offline"
            ? "Your library could not be reached."
            : "Enter your library passcode to listen, annotate, organize, and export tracks."}
        </p>

        {state === "offline" ? (
          <Button className="mt-6 w-full" onClick={() => void checkSession()}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        ) : state === "signedOut" ? (
          <form onSubmit={signIn} className="mt-6">
            <label htmlFor="library-passcode" className="text-sm font-semibold">
              Passcode
            </label>
            <input
              id="library-passcode"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-[var(--radius-control)] border border-[hsl(var(--stroke-strong))] bg-[hsl(var(--surface-raised))] px-3 text-base outline-none focus:ring-2 focus:ring-[hsl(var(--focus)/0.35)]"
            />
            {!configured && (
              <p className="mt-3 text-sm leading-5 text-[hsl(var(--danger))]">
                Set a non-default SONG_PASSWORD Worker secret before signing in.
              </p>
            )}
            {error && (
              <p className="mt-3 text-sm leading-5 text-[hsl(var(--danger))]" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              className="mt-5 w-full"
              disabled={!password || submitting || !configured}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Unlocking…" : "Unlock library"}
            </Button>
          </form>
        ) : null}
      </Surface>
    </main>
  );
}
