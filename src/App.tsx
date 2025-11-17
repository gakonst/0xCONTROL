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
      <div className="flex h-screen w-full flex-col overflow-hidden pb-24">
        <TrackList
          className="h-full w-full"
          tracks={trackBank}
          activeTrackId={currentTrack?.id ?? ""}
          onSelect={(track) => {
            setCurrentTrackId(track.id);
            setIsPlaying(true);
          }}
        />
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
