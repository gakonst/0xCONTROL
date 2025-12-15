import { buildApiUrl } from "@/lib/api";

export type AuthSession = { address: string };

async function handleJsonResponse(response: Response) {
  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(errorMessage || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchNonce(signal?: AbortSignal): Promise<string> {
  const response = await fetch(buildApiUrl("/api/siwe/nonce"), {
    method: "GET",
    credentials: "include",
    signal,
  });

  const data = await handleJsonResponse(response);
  return data.nonce as string;
}

export async function verifySiwe(params: { message: string; signature: string }) {
  const response = await fetch(buildApiUrl("/api/siwe/verify"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  await handleJsonResponse(response);
}

export async function fetchSession(signal?: AbortSignal): Promise<AuthSession | null> {
  const response = await fetch(buildApiUrl("/api/me"), {
    method: "GET",
    credentials: "include",
    signal,
  });

  if (response.status === 401) return null;
  return handleJsonResponse(response);
}

export async function logoutSession() {
  const response = await fetch(buildApiUrl("/api/siwe/logout"), {
    method: "POST",
    credentials: "include",
  });

  await handleJsonResponse(response);
}
