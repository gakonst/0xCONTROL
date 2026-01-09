CREATE TABLE IF NOT EXISTS track_metadata (
  track_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  genre TEXT,
  duration_seconds INTEGER NOT NULL,
  bpm INTEGER NOT NULL,
  musical_key TEXT NOT NULL,
  annotation_color TEXT,
  annotation_note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waveform_analysis (
  track_id TEXT PRIMARY KEY,
  waveform_json TEXT NOT NULL,
  bpm INTEGER,
  beat_offset_seconds REAL,
  duration_seconds REAL NOT NULL,
  sample_rate REAL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  mood TEXT NOT NULL,
  tags TEXT,
  accent_from TEXT,
  accent_to TEXT,
  cover TEXT,
  folder_path TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist
  ON playlist_tracks (playlist_id, position);
