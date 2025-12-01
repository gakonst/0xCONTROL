import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { getTrackUrl, type Track } from "@/data/tracks";

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
  const goToNextTrackRef = useRef<() => void>(() => {});

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId),
    [currentTrackId, tracks],
  );

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
      goToNextTrackRef.current();
      setIsPlaying(true);
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

    const trackUrl = getTrackUrl(currentTrack.id);
    if (trackUrlRef.current !== trackUrl) {
      trackUrlRef.current = trackUrl;
      setIsBuffering(true);
      setElapsedSeconds(0);
      setDurationSeconds(null);
      audio.src = trackUrl;
      audio.load();
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
  }, [currentTrack, currentTrackId, isPlaying]);

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
