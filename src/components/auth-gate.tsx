import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { shortenAddress } from "@/lib/utils";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { isConnecting } = useAccount();
  const [error, setError] = useState<string | null>(null);

  const isLoading = auth.isLoading || isConnecting;

  useEffect(() => {
    if (auth.connectionError) {
      setError(auth.connectionError.message);
    }
  }, [auth.connectionError]);
  if (isLoading) {
    return (
      <AppShell>
        <StatusCard title="Loading" description="Checking your session..." />
      </AppShell>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <AppShell>
        <AuthScreen
          onConnect={async (connector) => {
            setError(null);
            await auth.connect(connector);
          }}
          connectors={auth.connectors}
          onLogin={async () => {
            setError(null);
            try {
              await auth.login();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          isLoggingIn={auth.isLoggingIn}
          error={error}
        />
      </AppShell>
    );
  }

  return <>{children}</>;
}

function AuthScreen({
  connectors,
  onConnect,
  onLogin,
  isLoggingIn,
  error,
}: {
  connectors: ReturnType<typeof useAuth>["connectors"];
  onConnect: (connector: ReturnType<typeof useAuth>["connectors"][number]) => Promise<void>;
  onLogin: () => Promise<void>;
  isLoggingIn: boolean;
  error: string | null;
}) {
  const { address, isConnected } = useAccount();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#010308] px-6 py-12 text-foreground">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/60">Tempo Passkey</p>
            <h1 className="text-2xl font-semibold">Sign in to continue</h1>
          </div>
          {isConnected && address ? (
            <div className="rounded-lg bg-white/10 px-3 py-2 text-sm font-mono text-white/80">
              {shortenAddress(address)}
            </div>
          ) : null}
        </div>

        <p className="mt-3 text-sm text-white/70">
          Create or use your Tempo passkey to stay logged in. We use Sign-In with
          Ethereum (SIWE) to securely identify you and store your address privately.
        </p>

        <div className="mt-6 grid gap-3">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => onConnect(connector)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              disabled={!connector.ready}
            >
              {connector.name}
              {!connector.ready ? " (unsupported)" : ""}
            </button>
          ))}
        </div>

        <button
          onClick={onLogin}
          disabled={!isConnected || isLoggingIn}
          className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/60"
        >
          {isLoggingIn ? "Signing in..." : "Sign in with passkey"}
        </button>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}

function StatusCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#010308] px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-white/70">{description}</p>
      </div>
    </div>
  );
}
