import { memo, type ReactNode } from "react";

import { PlayerBar } from "@/components/player-bar";
import { TrackEditor } from "@/components/track-editor";
import { LibraryTabs, type LibraryTabKey } from "@/components/library-tabs";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";
import type { WaveformData } from "@/lib/waveform";

export type LibraryFooterProps = {
  track: Track;
  annotation?: TrackAnnotation;
  onAnnotationChange?: (update: Partial<TrackAnnotation>) => void;
  isPlaying: boolean;
  isBuffering: boolean;
  elapsedSeconds: number;
  durationSeconds?: number;
  bpmOverride?: number | null;
  waveform?: WaveformData | null;
  liveTimeGetter?: () => number;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onOpenFullScreen: () => void;
  activeTab: LibraryTabKey;
  onTabChange: (tab: LibraryTabKey) => void;
  extra?: ReactNode;
};

function LibraryFooterComponent({
  track,
  annotation,
  onAnnotationChange,
  isPlaying,
  isBuffering,
  elapsedSeconds,
  durationSeconds,
  bpmOverride,
  waveform,
  liveTimeGetter,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onOpenFullScreen,
  activeTab,
  onTabChange,
  extra,
}: LibraryFooterProps) {
  const handleAnnotationChange = onAnnotationChange ?? (() => {});

  return (
    <div className="shrink-0 border-t border-white/10 bg-[rgba(2,2,6,0.98)] text-white shadow-[0_-15px_60px_rgba(0,0,0,0.65)]">
      <TrackEditor
        track={track}
        annotation={annotation}
        onChange={handleAnnotationChange}
      />
      <PlayerBar
        variant="bare"
        className="px-4 py-3"
        track={track}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        elapsedSeconds={elapsedSeconds}
        durationSeconds={durationSeconds}
        bpmOverride={bpmOverride ?? undefined}
        waveform={waveform ?? undefined}
        liveTimeGetter={liveTimeGetter}
        onTogglePlay={onTogglePlay}
        onSkipNext={onSkipNext}
        onSkipPrevious={onSkipPrevious}
        onOpenFullScreen={onOpenFullScreen}
      />
      {extra}
      <div className="border-t border-white/10">
        <LibraryTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>
    </div>
  );
}

export const LibraryFooter = memo(LibraryFooterComponent, (prev, next) => {
  return (
    prev.track.id === next.track.id &&
    prev.annotation === next.annotation &&
    prev.isPlaying === next.isPlaying &&
    prev.isBuffering === next.isBuffering &&
    prev.elapsedSeconds === next.elapsedSeconds &&
    prev.durationSeconds === next.durationSeconds &&
    prev.bpmOverride === next.bpmOverride &&
    prev.waveform === next.waveform &&
    prev.liveTimeGetter === next.liveTimeGetter &&
    prev.activeTab === next.activeTab &&
    prev.onTabChange === next.onTabChange &&
    prev.onOpenFullScreen === next.onOpenFullScreen &&
    prev.onTogglePlay === next.onTogglePlay &&
    prev.onSkipNext === next.onSkipNext &&
    prev.onSkipPrevious === next.onSkipPrevious &&
    prev.extra === next.extra
  );
});
