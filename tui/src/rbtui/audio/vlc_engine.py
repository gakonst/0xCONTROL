from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import vlc


@dataclass
class PlaybackState:
    position_ms: int
    duration_ms: int
    is_playing: bool
    volume: int


class VlcEngine:
    def __init__(self) -> None:
        self.instance = vlc.Instance("--no-video", "--quiet")
        self.player = self.instance.media_player_new()

    def play(self, path: Path) -> None:
        media = self.instance.media_new(str(path))
        self.player.set_media(media)
        self.player.play()

    def pause(self) -> None:
        self.player.pause()

    def stop(self) -> None:
        self.player.stop()

    def toggle_pause(self) -> None:
        self.player.pause()

    def seek(self, delta_ms: int) -> None:
        current = self.player.get_time()
        if current == -1:
            return
        self.player.set_time(max(0, current + delta_ms))

    def set_volume(self, volume: int) -> None:
        self.player.audio_set_volume(max(0, min(100, volume)))

    def get_state(self) -> PlaybackState:
        position = self.player.get_time()
        duration = self.player.get_length()
        state = self.player.get_state()
        is_playing = state == vlc.State.Playing
        return PlaybackState(
            position_ms=max(0, position),
            duration_ms=max(0, duration),
            is_playing=is_playing,
            volume=self.player.audio_get_volume(),
        )

    def is_playing(self) -> bool:
        return self.player.is_playing() == 1

    def has_media(self) -> bool:
        return self.player.get_media() is not None

    def current_path(self) -> Optional[str]:
        media = self.player.get_media()
        if media is None:
            return None
        return media.get_mrl()
