from __future__ import annotations

import asyncio
from typing import Callable, Optional

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.reactive import reactive
from textual.screen import Screen
from textual.widgets import Button, Input, Label, ListItem, ListView

from rbtui.rb.client import PlaylistInfo, RekordboxClient


class StartupScreen(Screen):
    BINDINGS = [
        ("enter", "select", "Select playlist"),
        ("n", "new_playlist", "New playlist"),
        ("/", "search", "Search"),
        ("escape", "clear_search", "Clear search"),
        ("q", "quit", "Quit"),
    ]

    search_text = reactive("")

    def __init__(self, client: RekordboxClient, on_select: Callable[[PlaylistInfo], None]) -> None:
        super().__init__()
        self.client = client
        self.on_select = on_select
        self.playlists: list[PlaylistInfo] = []
        self.list_view = ListView(id="playlist-list")
        self.search_input = Input(placeholder="Search playlists...", id="playlist-search")

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Playlist Manager")
            yield self.search_input
            yield self.list_view
            yield Button("Create Playlist", id="create")

    def on_mount(self) -> None:
        asyncio.create_task(self.load_playlists())
        self.search_input.display = False

    async def load_playlists(self) -> None:
        playlists = await asyncio.to_thread(self.client.playlists, self.search_text)
        self.playlists = playlists
        self.list_view.clear()
        for playlist in playlists:
            self.list_view.append(ListItem(Label(playlist.name), id=str(playlist.playlist_id)))

    def action_search(self) -> None:
        self.search_input.display = True
        self.search_input.focus()

    async def action_clear_search(self) -> None:
        self.search_input.value = ""
        self.search_input.display = False
        self.search_text = ""
        await self.load_playlists()

    async def action_select(self) -> None:
        playlist = self._selected_playlist()
        if playlist:
            self.on_select(playlist)

    async def action_new_playlist(self) -> None:
        self.search_input.display = True
        self.search_input.focus()
        self.search_input.placeholder = "New playlist name"

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if self.search_input.placeholder == "New playlist name":
            asyncio.create_task(self._create_playlist(event.value))
        else:
            asyncio.create_task(self._search_playlists(event.value))

    async def _create_playlist(self, name: str) -> None:
        name = name.strip()
        if not name:
            return
        playlist = await asyncio.to_thread(self.client.create_playlist, name)
        self.search_input.value = ""
        self.search_input.placeholder = "Search playlists..."
        self.search_input.display = False
        await self.load_playlists()
        self.on_select(playlist)

    async def _search_playlists(self, value: str) -> None:
        self.search_text = value.strip()
        await self.load_playlists()

    def _selected_playlist(self) -> Optional[PlaylistInfo]:
        if self.list_view.index is None:
            return None
        item = self.list_view.get_child_at_index(self.list_view.index)
        if item is None or item.id is None:
            return None
        playlist_id = int(item.id)
        return next((p for p in self.playlists if p.playlist_id == playlist_id), None)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "create":
            self.action_new_playlist()
