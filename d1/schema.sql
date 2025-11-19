CREATE TABLE IF NOT EXISTS track_metadata (
  track_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  bpm INTEGER NOT NULL,
  musical_key TEXT NOT NULL,
  annotation_color TEXT,
  annotation_note TEXT,
  waveform_overview TEXT,
  waveform_detail TEXT,
  waveform_overview_bucket_duration REAL,
  waveform_detail_bucket_duration REAL,
  waveform_sample_rate INTEGER,
  analyzed_bpm REAL,
  analyzed_key TEXT,
  beat_grid TEXT,
  waveform_version INTEGER DEFAULT 1,
  analyzed_at TIMESTAMPTZ,
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
