# Waveform Preview Progress (Nov 19, 2025)

## What’s Done
- Added FFT-based RGB waveform analyzer (`worker/audio-analysis.ts`) used by the new `/api/tracks/:id/waveform` API.
- Worker now caches overview/detail buckets, BPM, key, beat grid, duration, and sample rate back into D1 (see new columns in `d1/schema.sql`).
- React data layer (`src/data/tracks.ts`) exposes waveform metadata plus a `fetchTrackWaveform` helper and hook (`use-track-waveform`).
- UI surfaces waveforms everywhere:
  - Track list shows Rekordbox-style thumbnails via `WaveformPreview`.
  - Fullscreen player renders the scrolling detail waveform with sync’d playhead via `PlaybackWaveform`.
- Local Bun script (`scripts/generate-waveform.ts`) renders a debug HTML page with audio playback + playhead overlay.

## Still To Do
1. **Audio decoding in Workers** – currently assumes `AudioContext.decodeAudioData`; replace with a WASM decoder (e.g., ffmpeg.wasm) or another supported approach.
2. **Backfill Analysis** – run the analyzer offline for every track and seed D1 so the UI never has to analyze on-demand.
3. **Beat Grid UX** – visualize beat markers in the fullscreen waveform and optionally in thumbnails.
4. **Playlists / Player Integration** – use analyzed BPM/key in UI (e.g., highlight mixing compatibility) and include waveform metadata in playlist exports.
5. **Error Handling & Retries** – add background jobs or worker alarms to retry failed analyses and monitor stats.

Keep this file updated as we iterate so we can quickly resume the waveform feature work.
