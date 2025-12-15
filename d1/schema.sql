CREATE TABLE IF NOT EXISTS track_metadata (
  track_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS siwe_nonces (
  nonce TEXT PRIMARY KEY,
  consumed INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_siwe_nonces_expires_at ON siwe_nonces (expires_at);

CREATE TABLE IF NOT EXISTS tempo_http_keys (
  key_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (address) REFERENCES users(address) ON DELETE CASCADE
);
