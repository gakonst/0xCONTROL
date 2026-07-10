# Rekordbox and downloader integration boundary

0xControl owns the mobile interaction model. The Rekordbox TypeScript port and
agentic downloader own filesystem/database access and ingestion. They meet at
the existing Worker API so neither system needs to know about React state.

## Rekordbox adapter

The adapter should map Rekordbox content into the current response shapes:

- `GET /api/catalog` returns stable track IDs plus title, artist, duration, BPM,
  key, and annotation fields.
- `GET /api/playlists` returns stable playlist IDs, ordered track IDs, and a
  `folderPath` array matching Rekordbox hierarchy.
- Playlist create/edit/delete, add/remove, and reorder routes write through to
  Rekordbox and return the normalized playlist record.

Stable IDs must survive a metadata rename. UI routes and the playback queue use
those IDs, so a filesystem path should only be an ID when the adapter can
guarantee that stability.

Backend adapters authenticate with `Authorization: Bearer <SONG_PASSWORD>`.
The mobile app exchanges the same secret for a secure HTTP-only session cookie,
so the passcode is not appended to track or ZIP download URLs.

## Downloader adapter

The downloader should upload the original object to R2 (or the configured local
object store), write catalog metadata, optionally add the stable track ID to a
playlist, and then invalidate or update the catalog endpoint. 0xControl does
not ingest source URLs directly; its download actions export library files.

The mobile refresh action re-reads both catalog and playlists. The service
worker uses network-first API reads with an offline fallback, so successful
external writes become visible without clearing the PWA cache.

## Export contract

- `GET /api/tracks/:trackId/download` returns the original object with an
  attachment filename and its original media type.
- `GET /api/playlists/:playlistId/download` streams a ZIP in playlist order.
  The Worker never assembles the archive in browser memory. Missing objects are
  listed in `0xcontrol-missing-tracks.txt` inside the archive and counted in the
  `X-0xControl-Missing-Tracks` response header.
