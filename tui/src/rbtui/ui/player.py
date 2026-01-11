from __future__ import annotations

from datetime import timedelta
from typing import Optional

from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Label, ProgressBar, Static

from rbtui.audio.queue import PlayQueue
from rbtui.audio.vlc_engine import PlaybackState, VlcEngine
from rbtui.constants import PLAYER_POLL_MS
from rbtui.models import TrackRow


def _format_time(ms: int) -> str:
    if ms <= 0:
        return "0:00"
    seconds = int(ms / 1000)
    return str(timedelta(seconds=seconds))[-5:]


class PlayerBar(Widget):
    DEFAULT_CSS = """
    PlayerBar {
        height: 3;
        dock: bottom;
        background: $panel;
    }
    """

    track_title = reactive("")
    track_meta = reactive("")
    time_label = reactive("0:00 / 0:00")

    def __init__(self) -> None:
        super().__init__()
        self.engine = VlcEngine()
        self.queue: Optional[PlayQueue] = None
        self.progress = ProgressBar(total=100, show_percentage=False)

    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Static("▶", id="player-icon")
            yield Label(self.track_title, id="player-title")
            yield Label(self.track_meta, id="player-meta")
            yield self.progress
            yield Label(self.time_label, id="player-time")

    def on_mount(self) -> None:
        self.set_interval(PLAYER_POLL_MS / 1000, self._poll)

    def set_queue(self, queue: PlayQueue) -> None:
        self.queue = queue

    def play_track(self, track: TrackRow) -> None:
        if track.path is None:
            if self.app:
                self.app.notify("Missing audio file", severity="warning")
            return
        self.engine.play(track.path)
        self._set_track(track)

    def _set_track(self, track: TrackRow) -> None:
        self.track_title = f"{track.title} — {track.artist}"
        bpm = f"{track.bpm:.2f}" if track.bpm else "—"
        self.track_meta = f"BPM {bpm} · Key {track.key}"

    def play_current(self) -> None:
        if self.queue is None:
            return
        track = self.queue.current()
        if track:
            self.play_track(track)

    def next(self) -> None:
        if self.queue is None:
            return
        track = self.queue.next()
        if track:
            self.play_track(track)

    def previous(self) -> None:
        if self.queue is None:
            return
        track = self.queue.previous()
        if track:
            self.play_track(track)

    def toggle_pause(self) -> None:
        self.engine.toggle_pause()

    def seek(self, delta_ms: int) -> None:
        self.engine.seek(delta_ms)

    def change_volume(self, delta: int) -> None:
        state = self.engine.get_state()
        self.engine.set_volume(state.volume + delta)

    def _poll(self) -> None:
        if not self.engine.has_media():
            return
        state = self.engine.get_state()
        self._update_progress(state)

    def _update_progress(self, state: PlaybackState) -> None:
        total = state.duration_ms
        current = state.position_ms
        if total <= 0:
            self.progress.update(progress=0, total=100)
            self.time_label = "0:00 / 0:00"
        else:
            percent = int((current / total) * 100)
            self.progress.update(progress=percent, total=100)
            self.time_label = f"{_format_time(current)} / {_format_time(total)}"
