import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlayerBar } from "@/components/player-bar";
import { TrackList } from "@/components/track-list";
import { fetchCatalogTracks } from "@/data/tracks";

function App() {
  const [currentTrackId, setCurrentTrackId] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);

  const { data: tracks = [] } = useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => fetchCatalogTracks(signal),
  });

  useEffect(() => {
    if (!tracks.length) {
      if (currentTrackId !== "") {
        setCurrentTrackId("");
      }
      return;
    }

    const isCurrentTrackAvailable = tracks.some(
      (track) => track.id === currentTrackId,
    );
    if (!isCurrentTrackAvailable) {
      setCurrentTrackId(tracks[0].id);
    }
  }, [tracks, currentTrackId]);

  const currentTrack = useMemo(
    () =>
      tracks.find((track) => track.id === currentTrackId) ?? tracks[0],
    [currentTrackId, tracks],
  );

  const goToNextTrack = () => {
    if (!currentTrack || tracks.length === 0) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = tracks[(index + 1) % tracks.length];
    setCurrentTrackId(nextTrack.id);
  };

  const goToPreviousTrack = () => {
    if (!currentTrack || tracks.length === 0) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const previousTrack =
      tracks[(index - 1 + tracks.length) % tracks.length];
    setCurrentTrackId(previousTrack.id);
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[#010308] text-foreground">
      <div className="flex h-screen w-full flex-col overflow-hidden pb-24">
        <TrackList
          className="h-full w-full"
          tracks={tracks}
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
          isBuffering={false}
          elapsedSeconds={0}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onSkipNext={goToNextTrack}
          onSkipPrevious={goToPreviousTrack}
        />
      )}
    </div>
  );
}

export default App;
