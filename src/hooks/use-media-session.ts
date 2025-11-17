import { useEffect } from "react";

import type { Track } from "@/data/tracks";

type UseMediaSessionOptions = {
  track?: Track;
  isPlaying: boolean;
  elapsedSeconds: number;
  durationSeconds?: number | null;
  onPlayRequest: () => void;
  onPauseRequest: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onSeekBackward?: (offsetSeconds?: number) => void;
  onSeekForward?: (offsetSeconds?: number) => void;
  onSeekTo?: (position: number) => void;
};

const DEFAULT_ALBUM = "0xCONTROL";

export function useMediaSession({
  track,
  isPlaying,
  elapsedSeconds,
  durationSeconds,
  onPlayRequest,
  onPauseRequest,
  onSkipNext,
  onSkipPrevious,
  onSeekBackward,
  onSeekForward,
  onSeekTo,
}: UseMediaSessionOptions) {
  const isSupported =
    typeof navigator !== "undefined" && "mediaSession" in navigator;

  useEffect(() => {
    if (!isSupported) return;
    const session = navigator.mediaSession;

    if (!track) {
      session.metadata = null;
      return;
    }

    const metadataInit: MediaMetadataInit = {
      title: track.title,
      artist: track.artist,
      album: DEFAULT_ALBUM,
    };

    if (track.cover) {
      metadataInit.artwork = [{ src: track.cover }];
    }

    session.metadata = new MediaMetadata(metadataInit);

    return () => {
      session.metadata = null;
    };
  }, [isSupported, track]);

  useEffect(() => {
    if (!isSupported) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isSupported, isPlaying]);

  useEffect(() => {
    if (!isSupported) return;
    const session = navigator.mediaSession;
    if (typeof session.setPositionState !== "function") return;

    if (
      typeof durationSeconds !== "number" ||
      Number.isNaN(durationSeconds) ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      return;
    }

    try {
      session.setPositionState({
        duration: durationSeconds,
        position: Math.min(durationSeconds, Math.max(0, elapsedSeconds)),
        playbackRate: isPlaying ? 1 : 0,
      });
    } catch {
      // Some browsers throw if the position state cannot be set; ignore silently.
    }
  }, [isSupported, elapsedSeconds, durationSeconds, isPlaying]);

  useEffect(() => {
    if (!isSupported) return;
    const session = navigator.mediaSession;

    const wrapAction =
      (callback?: () => void): MediaSessionActionHandler | null =>
        callback ? () => callback() : null;

    const wrapSeek =
      (
        callback?: (offsetSeconds?: number) => void,
        fallbackSeconds = 10,
      ): MediaSessionActionHandler | null =>
        callback
          ? (details) => {
              const offset = details.seekOffset ?? fallbackSeconds;
              callback(offset);
            }
          : null;

    const wrapSeekTo = (
      callback?: (position: number) => void,
    ): MediaSessionActionHandler | null =>
      callback
        ? (details) => {
            if (details.seekTime === undefined) return;
            callback(details.seekTime);
          }
        : null;

    const assignHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Unsupported actions throw in some browsers; ignore.
      }
    };

    const shouldMapSeekToTrackSkip = /iPad|iPhone|iPod/.test(
      navigator.userAgent || "",
    );

    const seekBackwardHandler = shouldMapSeekToTrackSkip
      ? wrapAction(onSkipPrevious)
      : wrapSeek(onSeekBackward);

    const seekForwardHandler = shouldMapSeekToTrackSkip
      ? wrapAction(onSkipNext)
      : wrapSeek(onSeekForward);

    assignHandler("play", wrapAction(onPlayRequest));
    assignHandler("pause", wrapAction(onPauseRequest));
    assignHandler("previoustrack", wrapAction(onSkipPrevious));
    assignHandler("nexttrack", wrapAction(onSkipNext));
    assignHandler("seekbackward", seekBackwardHandler);
    assignHandler("seekforward", seekForwardHandler);
    assignHandler("seekto", wrapSeekTo(onSeekTo));

    return () => {
      assignHandler("play", null);
      assignHandler("pause", null);
      assignHandler("previoustrack", null);
      assignHandler("nexttrack", null);
      assignHandler("seekbackward", null);
      assignHandler("seekforward", null);
      assignHandler("seekto", null);
    };
  }, [
    isSupported,
    onPlayRequest,
    onPauseRequest,
    onSkipNext,
    onSkipPrevious,
    onSeekBackward,
    onSeekForward,
    onSeekTo,
  ]);
}
