from __future__ import annotations

from typing import Callable, Iterable, Optional

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, ListItem, ListView, Static

from rbtui.models import ColorOption, TrackRow


class MetadataEditModal(ModalScreen[None]):
    def __init__(
        self,
        track: TrackRow,
        on_submit: Callable[[str, str, Optional[int], Optional[int]], None],
    ) -> None:
        super().__init__()
        self.track = track
        self.on_submit = on_submit

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Edit Metadata")
            yield Input(value=self.track.title, id="title")
            yield Input(value=self.track.comment, id="comment")
            yield Input(value=str(self.track.rating or ""), id="rating")
            yield Input(value=str(self.track.year or ""), id="year")
            yield Button("Save", id="save")
            yield Button("Cancel", id="cancel")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cancel":
            self.dismiss(None)
            return
        title = self.query_one("#title", Input).value.strip()
        comment = self.query_one("#comment", Input).value.strip()
        rating_raw = self.query_one("#rating", Input).value.strip()
        year_raw = self.query_one("#year", Input).value.strip()
        rating = int(rating_raw) if rating_raw.isdigit() else None
        year = int(year_raw) if year_raw.isdigit() else None
        self.on_submit(title, comment, rating, year)
        self.dismiss(None)


class ColorPickerModal(ModalScreen[None]):
    def __init__(
        self,
        colors: Iterable[ColorOption],
        on_select: Callable[[ColorOption], None],
    ) -> None:
        super().__init__()
        self.colors = list(colors)
        self.on_select = on_select

    def compose(self) -> ComposeResult:
        yield Static("Select Color")
        list_view = ListView(id="color-list")
        for color in self.colors:
            list_view.append(ListItem(Label(f"{color.name} ({color.rgb})"), id=str(color.color_id)))
        yield list_view
        yield Button("Cancel", id="cancel")

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        color_id = int(event.item.id) if event.item.id else None
        if color_id is None:
            return
        color = next((c for c in self.colors if c.color_id == color_id), None)
        if color:
            self.on_select(color)
        self.dismiss(None)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cancel":
            self.dismiss(None)
