from __future__ import annotations

import asyncio
from typing import Optional

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.screen import Screen
from textual.widgets import Footer, Input, Label

from rbtui.audio.queue import PlayQueue
from rbtui.models import ColorOption, TrackRow
from rbtui.rb.client import PlaylistInfo, RekordboxClient
from rbtui.ui.modals import ColorPickerModal, MetadataEditModal
from rbtui.ui.panes import CollectionPane, PlaylistPane
from rbtui.ui.player import PlayerBar
from rbtui.ui.startup import StartupScreen


class MainScreen(Screen):
    BINDINGS = [
        ("tab", "switch_focus", "Switch focus"),
        ("\\", "toggle_fullscreen", "Toggle fullscreen"),
        ("/", "search", "Search"),
        ("escape", "clear_search", "Clear search"),
        ("space", "toggle_select", "Toggle selection"),
        ("a", "add_to_playlist", "Add to playlist"),
        ("d", "remove_from_playlist", "Remove from playlist"),
        ("J", "move_down", "Move down"),
        ("K", "move_up", "Move up"),
        ("c", "pick_color", "Pick color"),
        ("m", "edit_metadata", "Edit metadata"),
        ("enter", "play", "Play"),
        ("p", "pause", "Pause"),
        ("n", "next_track", "Next"),
        ("b", "previous_track", "Previous"),
        ("left", "seek_back", "Seek back"),
        ("right", "seek_forward", "Seek forward"),
        ("shift+left", "seek_back_big", "Seek back"),
        ("shift+right", "seek_forward_big", "Seek forward"),
        ("+", "volume_up", "Volume up"),
        ("-", "volume_down", "Volume down"),
    ]

    search_text = reactive("")
    fullscreen = reactive(False)

    def __init__(self, app: "RBTuiApp", playlist: PlaylistInfo) -> None:
        super().__init__()
        self.app_ref = app
        self.client = app.client
        self.playlist = playlist
        self.collection = CollectionPane(self.client)
        self.playlist_pane = PlaylistPane(self.client, playlist.playlist_id, playlist.name)
        self.player = PlayerBar()
        self.status = Label("", id="status")
        self.search_input = Input(placeholder="Search...", id="search")
        self.focused = "collection"
        self.colors: list[ColorOption] = []

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(
                "READ ONLY: Rekordbox is running" if self.client.read_only else "",
                id="read-only",
            )
            yield self.search_input
            with Horizontal():
                yield self.collection
                yield self.playlist_pane
            yield self.status
            yield self.player
            yield Footer()

    def on_mount(self) -> None:
        self.search_input.display = False
        asyncio.create_task(self._load_colors())

    async def _load_colors(self) -> None:
        self.colors = await asyncio.to_thread(self.client.get_colors)

    def action_switch_focus(self) -> None:
        if self.focused == "collection":
            self.focused = "playlist"
            self.playlist_pane.focus()
        else:
            self.focused = "collection"
            self.collection.focus()

    def action_toggle_fullscreen(self) -> None:
        self.fullscreen = not self.fullscreen
        if self.fullscreen:
            if self.focused == "collection":
                self.playlist_pane.display = False
            else:
                self.collection.display = False
        else:
            self.playlist_pane.display = True
            self.collection.display = True

    def action_search(self) -> None:
        self.search_input.display = True
        self.search_input.focus()

    async def action_clear_search(self) -> None:
        self.search_input.value = ""
        self.search_input.display = False
        if self.focused == "collection":
            await self.collection.update_search("")

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id != "search":
            return
        text = event.value.strip()
        self.search_input.display = False
        if self.focused == "collection":
            await self.collection.update_search(text)

    def action_toggle_select(self) -> None:
        if self.focused == "collection":
            self.collection.toggle_selection()
        else:
            self.playlist_pane.toggle_selection()

    async def action_add_to_playlist(self) -> None:
        if self._check_read_only():
            return
        content_ids = self.collection.selected_content_ids()
        if not content_ids:
            return
        self.status.update(f"Adding {len(content_ids)} tracks…")
        await asyncio.to_thread(self.client.add_to_playlist, self.playlist.playlist_id, content_ids)
        await self.playlist_pane.refresh_playlist()
        self.status.update("")

    async def action_remove_from_playlist(self) -> None:
        if self._check_read_only():
            return
        song_ids = self.playlist_pane.selected_song_ids_list()
        if not song_ids:
            return
        self.status.update(f"Removing {len(song_ids)} tracks…")
        await asyncio.to_thread(self.client.remove_from_playlist, self.playlist.playlist_id, song_ids)
        await self.playlist_pane.refresh_playlist()
        self.status.update("")

    async def action_move_down(self) -> None:
        await self._reorder(1)

    async def action_move_up(self) -> None:
        await self._reorder(-1)

    async def _reorder(self, direction: int) -> None:
        if self._check_read_only():
            return
        entry = self.playlist_pane.highlighted_entry()
        if entry is None:
            return
        new_track_no = max(1, entry.track_no + direction)
        self.status.update("Reordering…")
        await asyncio.to_thread(
            self.client.reorder_song,
            self.playlist.playlist_id,
            entry.song_id,
            new_track_no,
        )
        await self.playlist_pane.refresh_playlist()
        self.status.update("")

    async def action_pick_color(self) -> None:
        if self._check_read_only():
            return
        track = self._current_track()
        if track is None:
            return

        def on_select(color: ColorOption) -> None:
            asyncio.create_task(self._apply_color(track, color))

        self.app_ref.push_screen(ColorPickerModal(self.colors, on_select))

    async def _apply_color(self, track: TrackRow, color: ColorOption) -> None:
        self.status.update("Updating color…")
        await asyncio.to_thread(self.client.update_color, track.content_id, color.color_id)
        await self._refresh_panes()
        self.status.update("")

    async def action_edit_metadata(self) -> None:
        if self._check_read_only():
            return
        track = self._current_track()
        if track is None:
            return

        def on_submit(title: str, comment: str, rating: Optional[int], year: Optional[int]) -> None:
            asyncio.create_task(self._apply_metadata(track, title, comment, rating, year))

        self.app_ref.push_screen(MetadataEditModal(track, on_submit))

    async def _apply_metadata(
        self,
        track: TrackRow,
        title: str,
        comment: str,
        rating: Optional[int],
        year: Optional[int],
    ) -> None:
        self.status.update("Saving metadata…")
        await asyncio.to_thread(
            self.client.update_metadata,
            track.content_id,
            title,
            comment,
            rating,
            year,
        )
        await self._refresh_panes()
        self.status.update("")

    async def _refresh_panes(self) -> None:
        await self.collection.load_page(self.collection.offset)
        await self.playlist_pane.refresh_playlist()

    def action_play(self) -> None:
        if self.focused == "collection":
            tracks = self.collection.current_tracks()
            index = self.collection.highlighted_index() or 0
        else:
            tracks = self.playlist_pane.current_tracks()
            index = self.playlist_pane.highlighted_index() or 0
        queue = PlayQueue.from_items(tracks)
        queue.set_index(index)
        self.player.set_queue(queue)
        self.player.play_current()

    def action_pause(self) -> None:
        self.player.toggle_pause()

    def action_next_track(self) -> None:
        self.player.next()

    def action_previous_track(self) -> None:
        self.player.previous()

    def action_seek_back(self) -> None:
        self.player.seek(-5000)

    def action_seek_forward(self) -> None:
        self.player.seek(5000)

    def action_seek_back_big(self) -> None:
        self.player.seek(-30000)

    def action_seek_forward_big(self) -> None:
        self.player.seek(30000)

    def action_volume_up(self) -> None:
        self.player.change_volume(5)

    def action_volume_down(self) -> None:
        self.player.change_volume(-5)

    def _current_track(self) -> Optional[TrackRow]:
        if self.focused == "collection":
            return self.collection.highlighted_track()
        entry = self.playlist_pane.highlighted_entry()
        return entry.content if entry else None

    def _check_read_only(self) -> bool:
        if self.client.read_only:
            self.app_ref.notify("Read-only mode: Rekordbox is running", severity="warning")
            return True
        return False


class RBTuiApp(App):
    CSS = """
    Screen {
        padding: 1;
    }

    #status {
        height: 1;
        color: $text-muted;
    }

    #read-only {
        color: $warning;
        height: 1;
    }

    #search {
        height: 3;
    }
    """

    def __init__(self) -> None:
        super().__init__()
        self.client = RekordboxClient()
        self.active_playlist: Optional[PlaylistInfo] = None

    def on_mount(self) -> None:
        self.push_screen(StartupScreen(self.client, self._set_playlist))

    def _set_playlist(self, playlist: PlaylistInfo) -> None:
        self.active_playlist = playlist
        self.pop_screen()
        self.push_screen(MainScreen(self, playlist))


def run() -> None:
    app = RBTuiApp()
    app.run()


if __name__ == "__main__":
    run()
