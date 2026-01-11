from __future__ import annotations

import asyncio
from typing import Iterable, Optional

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import DataTable, Label

from rbtui.constants import PAGE_SIZE
from rbtui.models import PlaylistEntryRow, TrackRow
from rbtui.rb.client import RekordboxClient


class CollectionPane(Widget):
    DEFAULT_CSS = """
    CollectionPane {
        border: tall $panel;
        height: 1fr;
    }
    """

    search_text = reactive("")

    def __init__(self, client: RekordboxClient) -> None:
        super().__init__()
        self.client = client
        self.table = DataTable(zebra_stripes=True)
        self.table.cursor_type = "row"
        self.offset = 0
        self.selected_ids: set[int] = set()
        self.rows: list[TrackRow] = []

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Collection", id="collection-title")
            yield self.table

    def on_mount(self) -> None:
        self.table.add_columns("Title", "Artist", "BPM", "Key")
        asyncio.create_task(self.load_page(0))

    async def load_page(self, offset: int) -> None:
        self.offset = max(0, offset)
        rows = await asyncio.to_thread(
            self.client.get_collection_page,
            self.offset,
            PAGE_SIZE,
            self.search_text,
        )
        self.rows = rows
        self._refresh_table()

    def _refresh_table(self) -> None:
        self.table.clear()
        for row in self.rows:
            prefix = "* " if row.content_id in self.selected_ids else ""
            bpm = f"{row.bpm:.2f}" if row.bpm else "—"
            self.table.add_row(
                f"{prefix}{row.title}",
                row.artist,
                bpm,
                row.key,
                key=str(row.content_id),
            )

    def toggle_selection(self) -> None:
        row_key = self.table.row_key
        if row_key is None:
            return
        content_id = int(row_key.value)
        if content_id in self.selected_ids:
            self.selected_ids.remove(content_id)
        else:
            self.selected_ids.add(content_id)
        self._refresh_table()

    def highlighted_track(self) -> Optional[TrackRow]:
        row_key = self.table.row_key
        if row_key is None:
            return None
        content_id = int(row_key.value)
        return next((row for row in self.rows if row.content_id == content_id), None)

    def highlighted_index(self) -> Optional[int]:
        return self.table.cursor_row

    def selected_content_ids(self) -> list[int]:
        if self.selected_ids:
            return list(self.selected_ids)
        track = self.highlighted_track()
        return [track.content_id] if track else []

    def current_tracks(self) -> list[TrackRow]:
        return self.rows

    async def update_search(self, text: str) -> None:
        self.search_text = text
        await self.load_page(0)


class PlaylistPane(Widget):
    DEFAULT_CSS = """
    PlaylistPane {
        border: tall $panel;
        height: 1fr;
    }
    """

    playlist_name = reactive("")

    def __init__(self, client: RekordboxClient, playlist_id: int, name: str) -> None:
        super().__init__()
        self.client = client
        self.playlist_id = playlist_id
        self.playlist_name = name
        self.table = DataTable(zebra_stripes=True)
        self.table.cursor_type = "row"
        self.offset = 0
        self.selected_song_ids: set[int] = set()
        self.rows: list[PlaylistEntryRow] = []

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(lambda: f"Playlist: {self.playlist_name}", id="playlist-title")
            yield self.table

    def on_mount(self) -> None:
        self.table.add_columns("#", "Title", "Artist", "BPM", "Key")
        asyncio.create_task(self.load_page(0))

    async def load_page(self, offset: int) -> None:
        self.offset = max(0, offset)
        rows = await asyncio.to_thread(
            self.client.get_playlist_page,
            self.playlist_id,
            self.offset,
            PAGE_SIZE,
        )
        self.rows = rows
        self._refresh_table()

    def _refresh_table(self) -> None:
        self.table.clear()
        for entry in self.rows:
            track = entry.content
            prefix = "* " if entry.song_id in self.selected_song_ids else ""
            bpm = f"{track.bpm:.2f}" if track.bpm else "—"
            self.table.add_row(
                str(entry.track_no),
                f"{prefix}{track.title}",
                track.artist,
                bpm,
                track.key,
                key=str(entry.song_id),
            )

    def toggle_selection(self) -> None:
        row_key = self.table.row_key
        if row_key is None:
            return
        song_id = int(row_key.value)
        if song_id in self.selected_song_ids:
            self.selected_song_ids.remove(song_id)
        else:
            self.selected_song_ids.add(song_id)
        self._refresh_table()

    def highlighted_entry(self) -> Optional[PlaylistEntryRow]:
        row_key = self.table.row_key
        if row_key is None:
            return None
        song_id = int(row_key.value)
        return next((row for row in self.rows if row.song_id == song_id), None)

    def highlighted_index(self) -> Optional[int]:
        return self.table.cursor_row

    def selected_song_ids_list(self) -> list[int]:
        if self.selected_song_ids:
            return list(self.selected_song_ids)
        entry = self.highlighted_entry()
        return [entry.song_id] if entry else []

    def current_tracks(self) -> list[TrackRow]:
        return [row.content for row in self.rows]

    async def refresh_playlist(self) -> None:
        await self.load_page(self.offset)

    async def update_playlist_name(self, name: str) -> None:
        self.playlist_name = name
        self.refresh()

    async def reorder_selected(self, direction: int) -> Optional[int]:
        entry = self.highlighted_entry()
        if entry is None:
            return None
        new_track_no = max(1, entry.track_no + direction)
        return new_track_no
