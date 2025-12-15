import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import type { Connector } from "wagmi";

import { fetchNonce, fetchSession, logoutSession, verifySiwe } from "@/data/auth";
import type { AuthSession } from "@/data/auth";

export type AuthState = {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  connectors: readonly Connector[];
  connect: (connector: Connector) => Promise<void>;
  connectingConnectorId?: string;
  connectionError?: Error | null;
  isLoggingIn: boolean;
};

export function useAuth(): AuthState {
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const { connectAsync, connectors, error: connectError, variables } = useConnect();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => fetchSession(signal),
    retry: false,
  });

  const session = sessionQuery.data ?? null;
  const isAuthenticated = Boolean(session?.address);
  const connectingConnectorId = (variables?.connector as Connector | undefined)?.uid;

  const connect = useCallback(
    async (connector: Connector) => {
      await connectAsync({ connector });
    },
    [connectAsync],
  );

  const login = useCallback(async () => {
    if (!isConnected || !address) {
      throw new Error("Connect a wallet or passkey first");
    }

    setIsLoggingIn(true);
    try {
      const nonce = await fetchNonce();
      const domain = window.location.host;
      const uri = window.location.origin;
      const message = createSiweMessage({
        domain,
        address,
        nonce,
        uri,
        chainId: chainId ?? 1,
        version: "1",
        statement: "Sign in with Tempo passkey",
      });

      const signature = await signMessageAsync({ message });
      await verifySiwe({ message, signature });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    } finally {
      setIsLoggingIn(false);
    }
  }, [address, chainId, isConnected, queryClient, signMessageAsync]);

  const logout = useCallback(async () => {
    await logoutSession();
    await disconnectAsync();
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [disconnectAsync, queryClient]);

  const connectionError = useMemo(() => {
    if (connectError) return connectError;
    return null;
  }, [connectError]);

  return {
    session,
    isAuthenticated,
    isLoading: sessionQuery.isLoading,
    login,
    logout,
    connectors,
    connect,
    connectingConnectorId,
    connectionError,
    isLoggingIn,
  };
}
