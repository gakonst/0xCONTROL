import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import Hls from "hls.js";

import { getTrackStreamUrl, getTrackUrl, type Track } from "@/data/tracks";
import { prefetchStreamFull } from "@/lib/stream-prefetch";

type PlaybackController = {
  currentTrackId: string;
  setCurrentTrackId: (id: string) => void;
  currentTrack: Track | undefined;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds: number | null;
  liveTimeGetter: () => number;
  goToNextTrack: () => void;
  goToPreviousTrack: () => void;
  handleTogglePlay: () => void;
  handlePlayRequest: () => void;
  handlePauseRequest: () => void;
  handleSeek: (seconds: number) => void;
  handleSeekForward: (offset?: number) => void;
  handleSeekBackward: (offset?: number) => void;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
};

export function usePlaybackController(
  tracks: Track[],
  initialTrackId?: string,
): PlaybackController {
  const [currentTrackId, setCurrentTrackId] = useState<string>(
    initialTrackId ?? tracks[0]?.id ?? "",
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const elapsedRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackUrlRef = useRef<string>("");
  const hlsRef = useRef<any | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const goToNextTrackRef = useRef<() => void>(() => {});
  const tracksRef = useRef<Track[]>(tracks);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId),
    [currentTrackId, tracks],
  );

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    if (!tracks.length) return;
    if (currentTrack) return;
    setCurrentTrackId(tracks[0].id);
  }, [tracks, currentTrack]);

  const goToTrackByOffset = useCallback(
    (offset: number) => {
      if (!currentTrack || tracks.length === 0) return;
      const index = tracks.findIndex((track) => track.id === currentTrack.id);
      if (index === -1) return;
      const nextTrack = tracks[(index + offset + tracks.length) % tracks.length];
      setCurrentTrackId(nextTrack.id);
    },
    [currentTrack, tracks],
  );

  const goToNextTrack = useCallback(() => {
    goToTrackByOffset(1);
  }, [goToTrackByOffset]);

  const goToPreviousTrack = useCallback(() => {
    goToTrackByOffset(-1);
  }, [goToTrackByOffset]);

  useEffect(() => {
    goToNextTrackRef.current = goToNextTrack;
  }, [goToNextTrack]);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }

    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleTimeUpdate = () => {
      elapsedRef.current = audio.currentTime;
      setElapsedSeconds(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      setDurationSeconds(duration);
      setIsBuffering(false);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      if (!audio.ended) setIsPlaying(false);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleEnded = () => {
      const availableTracks = tracksRef.current;
      const hasAlternateTrack = availableTracks.length > 1;

      if (hasAlternateTrack) {
        goToNextTrackRef.current();
        setIsPlaying(true);
        return;
      }

      const audioEl = audioRef.current;
      if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.pause();
      }
      setElapsedSeconds(0);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    hlsRef.current?.destroy();
    hlsRef.current = null;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (!currentTrackId || !currentTrack) return;

    const ensureAudio = () => {
      if (!audioRef.current) {
        const audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;
      }
      return audioRef.current;
    };

    const audio = ensureAudio();
    if (!audio) return;

    const streamUrl = getTrackStreamUrl(currentTrack.id);
    const fallbackUrl = getTrackUrl(currentTrack.id);

    const useDirectUrl = (nextUrl: string) => {
      if (trackUrlRef.current === nextUrl) return;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      trackUrlRef.current = nextUrl;
      setIsBuffering(true);
      setElapsedSeconds(0);
      setDurationSeconds(null);
      audio.src = nextUrl;
      audio.load();
    };

    const useHls = () => {
      if (trackUrlRef.current === streamUrl && hlsRef.current) return;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      trackUrlRef.current = streamUrl;
      setIsBuffering(true);
      setElapsedSeconds(0);
      setDurationSeconds(null);

      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
        if (!data.fatal) return;
        console.warn("HLS playback failed, falling back", data);
        useDirectUrl(fallbackUrl);
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
    };

    const canPlayNativeHls =
      audio.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      audio.canPlayType("application/x-mpegURL") !== "";

    const handleError = () => {
      if (trackUrlRef.current === streamUrl) {
        console.warn("Stream unavailable, falling back to MP3");
        useDirectUrl(fallbackUrl);
      }
    };

    audio.addEventListener("error", handleError);

    if (Hls.isSupported()) {
      useHls();
    } else if (canPlayNativeHls) {
      useDirectUrl(streamUrl);
    } else {
      useDirectUrl(fallbackUrl);
    }

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch((error) => {
          console.error("Unable to start playback", error);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }

    return () => {
      audio.removeEventListener("error", handleError);
    };
  }, [currentTrack, currentTrackId, isPlaying]);

  useEffect(() => {
    if (!currentTrack || !isPlaying) {
      prefetchAbortRef.current?.abort();
      prefetchAbortRef.current = null;
      return;
    }

    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    void prefetchStreamFull(currentTrack.id, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [currentTrack?.id, isPlaying]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handlePlayRequest = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePauseRequest = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || Number.isNaN(deltaSeconds)) return;

    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : undefined;

    const nextTime = Math.max(0, audio.currentTime + deltaSeconds);
    audio.currentTime =
      duration !== undefined ? Math.min(nextTime, duration) : nextTime;
  }, []);

  const handleSeekForward = useCallback(
    (offset = 10) => {
      seekBy(Math.abs(offset));
    },
    [seekBy],
  );

  const handleSeekBackward = useCallback(
    (offset = 10) => {
      seekBy(-Math.abs(offset));
    },
    [seekBy],
  );

  const handleSeek = useCallback((nextSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : null;
    const safeTarget = (() => {
      if (duration && duration > 0) {
        return Math.min(Math.max(nextSeconds, 0), duration);
      }
      return Math.max(nextSeconds, 0);
    })();
    audio.currentTime = safeTarget;
    setElapsedSeconds(safeTarget);
  }, []);

  const liveTimeGetter = useCallback(
    () => audioRef.current?.currentTime ?? elapsedRef.current,
    [],
  );

  return {
    currentTrackId,
    setCurrentTrackId,
    currentTrack,
    isPlaying,
    isBuffering,
    elapsedSeconds,
    durationSeconds,
    liveTimeGetter,
    goToNextTrack,
    goToPreviousTrack,
    handleTogglePlay,
    handlePlayRequest,
    handlePauseRequest,
    handleSeek,
    handleSeekForward,
    handleSeekBackward,
    audioRef,
  };
}
