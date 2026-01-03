from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class TrackRow:
    content_id: int
    title: str
    artist: str
    bpm: Optional[float]
    key: str
    rating: Optional[int]
    year: Optional[int]
    comment: str
    color_id: Optional[int]
    path: Optional[Path]


@dataclass(frozen=True)
class PlaylistEntryRow:
    song_id: int
    track_no: int
    content: TrackRow


@dataclass(frozen=True)
class ColorOption:
    color_id: int
    name: str
    rgb: str
