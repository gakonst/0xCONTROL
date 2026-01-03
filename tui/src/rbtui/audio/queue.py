from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from rbtui.models import TrackRow


@dataclass
class PlayQueue:
    items: List[TrackRow]
    index: int = 0

    @classmethod
    def from_items(cls, items: Iterable[TrackRow]) -> "PlayQueue":
        return cls(items=list(items), index=0)

    def current(self) -> TrackRow | None:
        if not self.items:
            return None
        return self.items[self.index]

    def set_index(self, index: int) -> None:
        if 0 <= index < len(self.items):
            self.index = index

    def next(self) -> TrackRow | None:
        if self.index + 1 < len(self.items):
            self.index += 1
            return self.items[self.index]
        return None

    def previous(self) -> TrackRow | None:
        if self.index - 1 >= 0:
            self.index -= 1
            return self.items[self.index]
        return None
