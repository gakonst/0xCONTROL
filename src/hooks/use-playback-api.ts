import type { Track } from "@/data/tracks";
import { usePlaybackController } from "@/hooks/use-playback-controller";

export type PlaybackApi = {
  state: {
    currentTrack?: Track;
    currentTrackId: string;
    isPlaying: boolean;
    isBuffering: boolean;
    elapsedSeconds: number;
    durationSeconds: number | null;
  };
  controls: {
    togglePlay: () => void;
    play: () => void;
    pause: () => void;
    seek: (seconds: number) => void;
    seekForward: (offset?: number) => void;
    seekBackward: (offset?: number) => void;
    next: () => void;
    previous: () => void;
  };
  liveTimeGetter: () => number;
  setCurrentTrackId: (id: string) => void;
  audioRef: ReturnType<typeof usePlaybackController>["audioRef"];
};

export function usePlaybackApi(tracks: Track[], initialTrackId?: string): PlaybackApi {
  const controller = usePlaybackController(tracks, initialTrackId);

  return {
    state: {
      currentTrack: controller.currentTrack,
      currentTrackId: controller.currentTrackId,
      isPlaying: controller.isPlaying,
      isBuffering: controller.isBuffering,
      elapsedSeconds: controller.elapsedSeconds,
      durationSeconds: controller.durationSeconds,
    },
    controls: {
      togglePlay: controller.handleTogglePlay,
      play: controller.handlePlayRequest,
      pause: controller.handlePauseRequest,
      seek: controller.handleSeek,
      seekForward: controller.handleSeekForward,
      seekBackward: controller.handleSeekBackward,
      next: controller.goToNextTrack,
      previous: controller.goToPreviousTrack,
    },
    liveTimeGetter: controller.liveTimeGetter,
    setCurrentTrackId: controller.setCurrentTrackId,
    audioRef: controller.audioRef,
  };
}
