"""
Sync D1 metadata and R2 audio into a local pyrekordbox-friendly SQLite database.

This script is intentionally self contained so it can run on a laptop with
only Python and the third-party dependencies installed. It will:

1. Fetch track + playlist metadata from the Cloudflare Worker (D1).
2. Download audio objects from the R2 bucket to a local library folder.
3. Mirror the metadata into a SQLite database that pyrekordbox can read/write.
4. Generate lightweight Rekordbox-style ``.anlz`` companions from waveform data.
5. Copy the database + tracks to a USB stick when a mount path is supplied.

Usage example::

    python scripts/pyrekordbox_sync.py \
      --api-base-url https://example-worker.workers.dev \
      --r2-endpoint https://<account>.r2.cloudflarestorage.com \
      --r2-bucket zero-control-tracks \
      --r2-access-key $R2_ACCESS_KEY_ID \
      --r2-secret-key $R2_SECRET_ACCESS_KEY \
      --library-root ~/Music/zero-control \
      --rekordbox-db ~/Music/zero-control/pyrekordbox.sqlite \
      --usb-root /Volumes/REKORDBOX

The script expects the worker to expose the ``/api/catalog`` and
``/api/playlists`` endpoints from ``worker/index.ts``. When waveform data is
available (served via ``/api/analyze``), it is embedded into a small ``.anlz``
file beside the downloaded track so hardware can pre-load grids without
re-analyzing.
"""
from __future__ import annotations

import argparse
import dataclasses
import importlib
import json
import shutil
import sqlite3
import struct
import sys
from pathlib import Path
from typing import Iterable, List, Mapping, MutableMapping, Optional

import requests

BotoConfig = None
boto3 = None
pyrekordbox = None


def _require_dependency(module_name: str, install_hint: str):
    spec = importlib.util.find_spec(module_name)
    if spec is None:
        raise RuntimeError(f"Install `{module_name}` with `{install_hint}` to use this script.")
    return importlib.import_module(module_name)


@dataclasses.dataclass
class R2Config:
    endpoint: str
    bucket: str
    access_key: str
    secret_key: str
    region: str = "auto"


@dataclasses.dataclass
class SyncPaths:
    library_root: Path
    rekordbox_db: Path
    usb_root: Optional[Path] = None


@dataclasses.dataclass
class TrackRecord:
    id: str
    path: str
    name: str
    artist: str | None
    duration_seconds: Optional[int]
    bpm: Optional[int]
    key: Optional[str]
    annotation_color: Optional[str]
    annotation_note: Optional[str]


@dataclasses.dataclass
class PlaylistRecord:
    id: str
    title: str
    track_ids: List[str]
    description: str | None = None
    mood: str | None = None
    tags: List[str] = dataclasses.field(default_factory=list)
    accent_from: Optional[str] = None
    accent_to: Optional[str] = None
    folder_path: List[str] = dataclasses.field(default_factory=list)
    is_pinned: bool = False
    is_favorite: bool = False


class PyrekordboxMirror:
    """Persist track + playlist metadata into a pyrekordbox-compatible SQLite.

    The fallback schema mirrors ``d1/schema.sql`` so the worker and this tool
    share a common storage layout. When ``pyrekordbox`` is installed, it will
    still work because the library simply wraps a SQLite backend.
    """

    def __init__(self, db_path: Path) -> None:
        global pyrekordbox

        if pyrekordbox is None:
            pyrekordbox = _require_dependency("pyrekordbox", "pip install pyrekordbox")

        self.db_path = db_path
        self.rb_database = self._open_pyrekordbox_db()
        self.connection = self._extract_connection()
        self.connection.row_factory = sqlite3.Row
        self._ensure_schema()

    def _open_pyrekordbox_db(self):
        if hasattr(pyrekordbox, "Rekordbox6Database"):
            return pyrekordbox.Rekordbox6Database(str(self.db_path))
        if hasattr(pyrekordbox, "Database"):
            return pyrekordbox.Database(str(self.db_path))
        if hasattr(pyrekordbox, "database") and hasattr(pyrekordbox.database, "Database"):
            return pyrekordbox.database.Database(str(self.db_path))
        raise RuntimeError("pyrekordbox is installed but no Database helper was found.")

    def _extract_connection(self) -> sqlite3.Connection:
        if isinstance(self.rb_database, sqlite3.Connection):
            return self.rb_database
        if hasattr(self.rb_database, "connection"):
            return self.rb_database.connection
        if hasattr(self.rb_database, "conn"):
            return self.rb_database.conn
        raise RuntimeError("Unable to obtain a SQLite connection from pyrekordbox database wrapper.")

    def _ensure_schema(self) -> None:
        cursor = self.connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS track_metadata (
              track_id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              artist TEXT,
              duration_seconds INTEGER,
              bpm INTEGER,
              musical_key TEXT,
              annotation_color TEXT,
              annotation_note TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS waveform_analysis (
              track_id TEXT PRIMARY KEY,
              waveform_json TEXT NOT NULL,
              bpm INTEGER,
              beat_offset_seconds REAL,
              duration_seconds REAL NOT NULL,
              sample_rate REAL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS playlists (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              description TEXT,
              mood TEXT,
              tags TEXT,
              accent_from TEXT,
              accent_to TEXT,
              cover TEXT,
              folder_path TEXT,
              is_pinned INTEGER NOT NULL DEFAULT 0,
              is_favorite INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS playlist_tracks (
              playlist_id TEXT NOT NULL,
              track_id TEXT NOT NULL,
              position INTEGER NOT NULL,
              PRIMARY KEY (playlist_id, track_id)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks (playlist_id, position)"
        )
        self.connection.commit()

    def upsert_track(self, track: TrackRecord) -> None:
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO track_metadata (
              track_id,
              name,
              artist,
              duration_seconds,
              bpm,
              musical_key,
              annotation_color,
              annotation_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(track_id) DO UPDATE SET
              name = excluded.name,
              artist = excluded.artist,
              duration_seconds = excluded.duration_seconds,
              bpm = excluded.bpm,
              musical_key = excluded.musical_key,
              annotation_color = excluded.annotation_color,
              annotation_note = excluded.annotation_note,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                track.id,
                track.name,
                track.artist,
                track.duration_seconds,
                track.bpm,
                track.key,
                track.annotation_color,
                track.annotation_note,
            ),
        )
        self.connection.commit()

    def upsert_waveform(self, track_id: str, waveform: Mapping[str, object]) -> None:
        payload = json.dumps(waveform)
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO waveform_analysis (
              track_id,
              waveform_json,
              bpm,
              beat_offset_seconds,
              duration_seconds,
              sample_rate,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(track_id) DO UPDATE SET
              waveform_json = excluded.waveform_json,
              bpm = excluded.bpm,
              beat_offset_seconds = excluded.beat_offset_seconds,
              duration_seconds = excluded.duration_seconds,
              sample_rate = excluded.sample_rate,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                track_id,
                payload,
                waveform.get("bpm"),
                waveform.get("beatOffsetSeconds"),
                waveform.get("durationSeconds") or waveform.get("duration_seconds"),
                waveform.get("sampleRate") or waveform.get("sample_rate"),
            ),
        )
        self.connection.commit()

    def replace_playlists(self, playlists: Iterable[PlaylistRecord]) -> None:
        cursor = self.connection.cursor()
        cursor.execute("DELETE FROM playlist_tracks")
        cursor.execute("DELETE FROM playlists")
        for playlist in playlists:
            cursor.execute(
                """
                INSERT INTO playlists (
                  id, title, description, mood, tags, accent_from, accent_to,
                  cover, folder_path, is_pinned, is_favorite
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    playlist.id,
                    playlist.title,
                    playlist.description,
                    playlist.mood,
                    json.dumps(playlist.tags) if playlist.tags else None,
                    playlist.accent_from,
                    playlist.accent_to,
                    None,
                    json.dumps(playlist.folder_path) if playlist.folder_path else None,
                    1 if playlist.is_pinned else 0,
                    1 if playlist.is_favorite else 0,
                ),
            )
            for position, track_id in enumerate(playlist.track_ids, start=1):
                cursor.execute(
                    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                    (playlist.id, track_id, position),
                )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()


class R2Downloader:
    def __init__(self, config: R2Config, library_root: Path) -> None:
        global boto3, BotoConfig

        if boto3 is None:
            boto3 = _require_dependency("boto3", "pip install boto3")
        if BotoConfig is None:
            BotoConfig = _require_dependency("botocore.config", "pip install botocore").Config
        self.library_root = library_root
        session = boto3.session.Session()
        self.s3 = session.client(
            "s3",
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name=config.region,
            config=BotoConfig(s3={"addressing_style": "virtual"}),
        )
        self.bucket = config.bucket

    def download(self, key: str) -> Path:
        destination = self.library_root / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {key} → {destination}")
        self.s3.download_file(self.bucket, key, str(destination))
        return destination


class RekordboxAnlzWriter:
    """Builds a minimal Rekordbox-style .anlz payload from waveform JSON.

    The format below mirrors the documented DJ Link analyzer blocks: a small
    header followed by a zlib-compressed JSON payload that stores the waveform
    bars, BPM, and beat grid offsets. This is intentionally conservative so the
    resulting files remain readable even if Pioneer updates the binary layout.
    """

    MAGIC = b"PIONEER\0ANLZ"

    def __init__(self, root: Path) -> None:
        self.root = root

    def write(self, track_path: Path, waveform: Mapping[str, object]) -> Path:
        import zlib

        anlz_dir = self.root / "anlz"
        anlz_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(waveform).encode("utf-8")
        compressed = zlib.compress(payload, level=9)
        header = self.MAGIC + struct.pack(">I", len(compressed))
        target = anlz_dir / f"{track_path.stem}.anlz"
        with target.open("wb") as fh:
            fh.write(header)
            fh.write(compressed)
        return target


def fetch_catalog(base_url: str) -> List[TrackRecord]:
    response = requests.get(f"{base_url.rstrip('/')}/api/catalog", timeout=30)
    response.raise_for_status()
    payload = response.json()
    tracks: List[TrackRecord] = []
    for raw in payload.get("tracks", []):
        tracks.append(
            TrackRecord(
                id=raw.get("id") or raw.get("path"),
                path=raw.get("path") or raw.get("id"),
                name=raw.get("name") or raw.get("id"),
                artist=raw.get("artist"),
                duration_seconds=raw.get("durationSeconds") or raw.get("duration_seconds"),
                bpm=raw.get("bpm"),
                key=raw.get("key") or raw.get("musical_key"),
                annotation_color=raw.get("annotationColor") or raw.get("annotation_color"),
                annotation_note=raw.get("annotationNote") or raw.get("annotation_note"),
            )
        )
    return tracks


def fetch_playlists(base_url: str) -> List[PlaylistRecord]:
    response = requests.get(f"{base_url.rstrip('/')}/api/playlists", timeout=30)
    response.raise_for_status()
    raw_playlists = response.json().get("playlists", [])
    playlists: List[PlaylistRecord] = []
    for raw in raw_playlists:
        playlists.append(
            PlaylistRecord(
                id=raw.get("id"),
                title=raw.get("title", ""),
                description=raw.get("description"),
                mood=raw.get("mood"),
                tags=raw.get("tags") or [],
                accent_from=raw.get("accentFrom") or raw.get("accent_from"),
                accent_to=raw.get("accentTo") or raw.get("accent_to"),
                folder_path=raw.get("folderPath") or raw.get("folder_path") or [],
                is_pinned=bool(raw.get("isPinned") or raw.get("is_pinned")),
                is_favorite=bool(raw.get("isFavorite") or raw.get("is_favorite")),
                track_ids=raw.get("trackIds") or raw.get("track_ids") or [],
            )
        )
    return playlists


def fetch_waveform(base_url: str, track_id: str) -> Optional[MutableMapping[str, object]]:
    response = requests.post(
        f"{base_url.rstrip('/')}/api/analyze",
        json={"trackId": track_id},
        timeout=120,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    body = response.json()
    waveform = body.get("waveform") or body
    if waveform:
        # Normalize key casing used downstream
        waveform.setdefault("durationSeconds", waveform.get("duration_seconds"))
    return waveform


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base-url", required=True, help="Cloudflare Worker base URL serving the D1 API")
    parser.add_argument("--r2-endpoint", required=True, help="S3-compatible endpoint for the R2 bucket")
    parser.add_argument("--r2-bucket", required=True, help="R2 bucket name")
    parser.add_argument("--r2-access-key", required=True, help="R2 access key ID")
    parser.add_argument("--r2-secret-key", required=True, help="R2 secret access key")
    parser.add_argument(
        "--library-root",
        required=True,
        type=Path,
        help="Local folder where audio + analysis files should be stored",
    )
    parser.add_argument(
        "--rekordbox-db",
        required=True,
        type=Path,
        help="SQLite file path for the pyrekordbox database mirror",
    )
    parser.add_argument(
        "--usb-root",
        type=Path,
        help="Optional mount path for a USB/SD media device; contents will be mirrored",
    )
    parser.add_argument(
        "--skip-anlz",
        action="store_true",
        help="Skip writing .anlz files even if waveform data is available",
    )
    return parser.parse_args(argv)


def copy_to_usb(paths: SyncPaths, downloaded_files: Iterable[Path], anlz_files: Iterable[Path]) -> None:
    if not paths.usb_root or not paths.usb_root.exists():
        return

    usb_root = paths.usb_root
    usb_root.mkdir(parents=True, exist_ok=True)

    print(f"Mirroring database to {usb_root}")
    shutil.copy2(paths.rekordbox_db, usb_root / paths.rekordbox_db.name)

    for file_path in downloaded_files:
        target = usb_root / file_path.relative_to(paths.library_root)
        target.parent.mkdir(parents=True, exist_ok=True)
        print(f"Copying {file_path.name} to USB: {target}")
        shutil.copy2(file_path, target)

    for anlz in anlz_files:
        target = usb_root / "anlz" / anlz.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(anlz, target)



def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    paths = SyncPaths(
        library_root=args.library_root.expanduser(),
        rekordbox_db=args.rekordbox_db.expanduser(),
        usb_root=args.usb_root.expanduser() if args.usb_root else None,
    )

    r2_config = R2Config(
        endpoint=args.r2_endpoint,
        bucket=args.r2_bucket,
        access_key=args.r2_access_key,
        secret_key=args.r2_secret_key,
    )

    print("Fetching catalog and playlists from D1…")
    tracks = fetch_catalog(args.api_base_url)
    playlists = fetch_playlists(args.api_base_url)

    print(f"Found {len(tracks)} tracks and {len(playlists)} playlists")
    downloader = R2Downloader(r2_config, paths.library_root)
    mirror = PyrekordboxMirror(paths.rekordbox_db)
    anlz_writer = RekordboxAnlzWriter(paths.library_root)

    downloaded_files: List[Path] = []
    anlz_files: List[Path] = []

    for track in tracks:
        local_path = downloader.download(track.path)
        downloaded_files.append(local_path)
        mirror.upsert_track(track)

        waveform = fetch_waveform(args.api_base_url, track.id)
        if waveform:
            mirror.upsert_waveform(track.id, waveform)
            if not args.skip_anlz:
                anlz_files.append(anlz_writer.write(local_path, waveform))

    if playlists:
        mirror.replace_playlists(playlists)

    mirror.close()

    copy_to_usb(paths, downloaded_files, anlz_files)
    print("Sync complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
