from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from pyrekordbox import MasterDatabase
from pyrekordbox.masterdb import models
from pyrekordbox.utils import get_rekordbox_pid

from rbtui.models import ColorOption, PlaylistEntryRow, TrackRow
from rbtui.rb.paths import resolve_audio_path
from rbtui.rb.queries import collection_query, playlist_query, playlist_songs_query
from rbtui.util import normalize_bpm


@dataclass(frozen=True)
class PlaylistInfo:
    playlist_id: int
    name: str


class RekordboxClient:
    def __init__(self) -> None:
        self.db = MasterDatabase()
        self.read_only = get_rekordbox_pid() is not None

    def playlists(self, search: Optional[str] = None) -> list[PlaylistInfo]:
        return [
            PlaylistInfo(playlist_id=row.ID, name=row.Name)
            for row in playlist_query(self.db, search=search)
        ]

    def create_playlist(self, name: str) -> PlaylistInfo:
        playlist = self.db.create_playlist(name)
        self.db.commit()
        return PlaylistInfo(playlist_id=playlist.ID, name=playlist.Name)

    def get_collection_page(
        self,
        offset: int,
        limit: int,
        search: Optional[str] = None,
        sort_key: str = "Title",
    ) -> list[TrackRow]:
        query = collection_query(self.db, search=search, sort_key=sort_key)
        rows = query.limit(limit).offset(offset)
        return [self._track_row(row) for row in rows]

    def get_playlist_page(self, playlist_id: int, offset: int, limit: int) -> list[PlaylistEntryRow]:
        query = playlist_songs_query(self.db, playlist_id)
        rows = query.limit(limit).offset(offset)
        return [
            PlaylistEntryRow(song_id=row.ID, track_no=row.TrackNo, content=self._track_row(row.Content))
            for row in rows
        ]

    def add_to_playlist(self, playlist_id: int, content_ids: Iterable[int]) -> None:
        playlist = self.db.get_playlist(ID=playlist_id)
        for content_id in content_ids:
            content = self.db.get_content(ID=content_id)
            if content is None:
                continue
            self.db.add_to_playlist(playlist, content)
        self.db.commit()

    def remove_from_playlist(self, playlist_id: int, song_ids: Iterable[int]) -> None:
        playlist = self.db.get_playlist(ID=playlist_id)
        for song_id in song_ids:
            song = self.db.query(models.DjmdSongPlaylist).filter_by(ID=song_id).one_or_none()
            if song is None:
                continue
            self.db.remove_from_playlist(playlist, song)
        self.db.commit()

    def reorder_song(self, playlist_id: int, song_id: int, new_track_no: int) -> None:
        song = self.db.query(models.DjmdSongPlaylist).filter_by(ID=song_id).one_or_none()
        if song is None:
            return
        song.TrackNo = new_track_no
        self._renumber_playlist(playlist_id)
        self.db.commit()

    def _renumber_playlist(self, playlist_id: int) -> None:
        songs = list(playlist_songs_query(self.db, playlist_id))
        for index, song in enumerate(songs, start=1):
            song.TrackNo = index

    def update_metadata(
        self,
        content_id: int,
        title: str,
        comment: str,
        rating: Optional[int],
        year: Optional[int],
    ) -> None:
        content = self.db.get_content(ID=content_id)
        if content is None:
            return
        content.Title = title
        content.Commnt = comment
        content.Rating = rating
        content.ReleaseYear = year
        self.db.commit()

    def get_colors(self) -> list[ColorOption]:
        return [
            ColorOption(color_id=color.ID, name=color.Name, rgb=color.Color)
            for color in self.db.get_color()
        ]

    def update_color(self, content_id: int, color_id: int) -> None:
        content = self.db.get_content(ID=content_id)
        if content is None:
            return
        content.ColorID = color_id
        self.db.commit()

    def _track_row(self, row: models.DjmdContent) -> TrackRow:
        path = resolve_audio_path(row.FolderPath, row.FileNameL, row.OrgFolderPath)
        return TrackRow(
            content_id=row.ID,
            title=row.Title or "",
            artist=row.Artist.Name if row.Artist else row.ArtistName or "",
            bpm=normalize_bpm(row.BPM),
            key=row.Key.ScaleName if row.Key else row.KeyName or "",
            rating=row.Rating,
            year=row.ReleaseYear,
            comment=row.Commnt or "",
            color_id=row.ColorID,
            path=path,
        )
