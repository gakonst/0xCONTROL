import { useMemo, useState } from "react";

import { PlayerBar } from "@/components/player-bar";
import { TrackList } from "@/components/track-list";
import { tracks as trackBank } from "@/data/tracks";

function App() {
  const [currentTrackId, setCurrentTrackId] = useState(
    () => trackBank[0]?.id ?? "",
  );
  const [isPlaying, setIsPlaying] = useState(true);

  const currentTrack = useMemo(
    () =>
      trackBank.find((track) => track.id === currentTrackId) ?? trackBank[0],
    [currentTrackId],
  );

  const goToNextTrack = () => {
    if (!currentTrack) return;
    const index = trackBank.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = trackBank[(index + 1) % trackBank.length];
    setCurrentTrackId(nextTrack.id);
  };

  const goToPreviousTrack = () => {
    if (!currentTrack) return;
    const index = trackBank.findIndex((track) => track.id === currentTrack.id);
    const previousTrack =
      trackBank[(index - 1 + trackBank.length) % trackBank.length];
    setCurrentTrackId(previousTrack.id);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[#010308] text-foreground">
      <div className="mx-auto flex h-screen w-full max-w-5xl flex-col overflow-hidden px-4 pt-8 md:px-8 lg:px-10">
        <header className="pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2rem] text-foreground md:text-base">
            0xControl
          </p>
        </header>

        <div className="flex-1 min-h-0">
          <TrackList
            className="h-full"
            tracks={trackBank}
            activeTrackId={currentTrack?.id ?? ""}
            onSelect={(track) => {
              setCurrentTrackId(track.id);
              setIsPlaying(true);
            }}
          />
        </div>
      </div>

      {currentTrack && (
        <PlayerBar
          track={currentTrack}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onSkipNext={goToNextTrack}
          onSkipPrevious={goToPreviousTrack}
        />
      )}
    </div>
  );
}

export default App;
