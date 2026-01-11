from __future__ import annotations

from typing import Optional

from pyrekordbox import MasterDatabase
from pyrekordbox.masterdb import models


def playlist_query(db: MasterDatabase, search: Optional[str] = None):
    query = db.query(models.DjmdPlaylist).filter(models.DjmdPlaylist.Attribute == 0)
    if search:
        query = query.filter(models.DjmdPlaylist.Name.ilike(f"%{search}%"))
    return query.order_by(models.DjmdPlaylist.Name)


def collection_query(db: MasterDatabase, search: Optional[str] = None, sort_key: str = "Title"):
    query = db.query(models.DjmdContent)
    if search:
        term = f"%{search}%"
        query = query.filter(
            models.DjmdContent.Title.ilike(term)
            | models.DjmdContent.ArtistName.ilike(term)
        )
    if hasattr(models.DjmdContent, sort_key):
        query = query.order_by(getattr(models.DjmdContent, sort_key))
    else:
        query = query.order_by(models.DjmdContent.Title)
    return query


def playlist_songs_query(db: MasterDatabase, playlist_id: int):
    return (
        db.query(models.DjmdSongPlaylist)
        .filter_by(PlaylistID=playlist_id)
        .order_by(models.DjmdSongPlaylist.TrackNo)
    )
