import { type ReactNode } from "react";

import { PlayerBar } from "@/components/player-bar";
import { TrackEditor } from "@/components/track-editor";
import { LibraryTabs, type LibraryTabKey } from "@/components/library-tabs";
import type { Track } from "@/data/tracks";
import type { TrackAnnotation } from "@/types/annotations";
import type { WaveformData } from "@/lib/waveform";
import {
  PLAYLIST_FOOTER_TOOLS_TARGET_ID,
  TRACK_FOOTER_TOOLS_TARGET_ID,
} from "@/components/footer-tools-portal";

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
  beatOffsetSeconds?: number | null;
  liveTimeGetter?: () => number;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onOpenFullScreen: () => void;
  activeTab: LibraryTabKey;
  onTabChange: (tab: LibraryTabKey) => void;
  isSearchOpen?: boolean;
  onSearchToggle?: () => void;
  searchToolsKey?: "tracks" | "playlists";
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
  beatOffsetSeconds,
  liveTimeGetter,
  onTogglePlay,
  onSkipNext,
  onSkipPrevious,
  onOpenFullScreen,
  activeTab,
  onTabChange,
  isSearchOpen = false,
  onSearchToggle,
  searchToolsKey = "tracks",
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
        beatOffsetSeconds={beatOffsetSeconds ?? undefined}
        liveTimeGetter={liveTimeGetter}
        onTogglePlay={onTogglePlay}
        onSkipNext={onSkipNext}
        onSkipPrevious={onSkipPrevious}
        onOpenFullScreen={onOpenFullScreen}
      />
      {extra}
      <div
        id={TRACK_FOOTER_TOOLS_TARGET_ID}
        className={
          isSearchOpen && searchToolsKey === "tracks"
            ? "border-t border-white/10 bg-black/70"
            : "hidden"
        }
      />
      <div
        id={PLAYLIST_FOOTER_TOOLS_TARGET_ID}
        className={
          isSearchOpen && searchToolsKey === "playlists"
            ? "border-t border-white/10 bg-black/70"
            : "hidden"
        }
      />
      <div className="border-t border-white/10">
        <LibraryTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          isSearchOpen={isSearchOpen}
          onSearchToggle={onSearchToggle}
        />
      </div>
    </div>
  );
}

export const LibraryFooter = LibraryFooterComponent;
