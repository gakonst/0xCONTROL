import { buildApiUrl } from "@/lib/api";
import type { TrackAnnotation } from "@/types/annotations";

export type UpdateTrackAnnotationPayload = Partial<TrackAnnotation>;

export async function updateTrackAnnotation(
  trackId: string,
  payload: UpdateTrackAnnotationPayload,
): Promise<TrackAnnotation | undefined> {
  const encodedId = encodeURIComponent(trackId);
  const response = await fetch(
    buildApiUrl(`/api/tracks/${encodedId}/annotation`),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorMessage = await safeExtractErrorMessage(response);
    throw new Error(errorMessage);
  }

  try {
    const data = (await response.json()) as { annotation?: TrackAnnotation };
    return data.annotation;
  } catch {
    return undefined;
  }
}

async function safeExtractErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) {
      return payload.error;
    }
  } catch {
    // Ignore JSON parsing failures and fall back to generic text.
  }

  return `Annotation update failed with status ${response.status}`;
}
