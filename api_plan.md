## API and Worker Design

- Track metadata lives in D1 with columns like id, title, artist, duration, waveform stats, storage key.
- Provide cursor-based pagination endpoint `GET /tracks?after=<cursor>&limit=50` returning `{ tracks, nextCursor }`.
- List endpoint returns lightweight view (text fields, artwork thumb, bitrate). Heavy fields fetched via `GET /tracks/:id`.
- Playback path uses `GET /tracks/:id/stream` returning signed URL or redirect to HLS playlist stored in object storage.
- Upload pipeline records storage key and enqueues background job for FFmpeg processing.

## Infinite Scroll UI

- UI loads initial 25–100 rows and uses nextCursor to fetch more when scroll nears end.
- Cache paginated results client-side (TanStack Query/SWR) and reuse cursors per filter/search.
- Cursor uses sort column (timestamp/id) to avoid duplicates or skips between inserts.
- Offer additional filter/search endpoints that still return cursor-based pagination.

## Worker and FFmpeg Pipeline

- Maintain job table with `track_id`, `status`, `last_processed`, `error`.
- Worker picks pending jobs, runs FFmpeg to create multi-bitrate HLS output (variant.m3u8, segments ~4–6s).
- Store segments/manifests in object storage (R2/S3) and update D1 with manifest URL.
- Send UI events or status updates when processing completes for realtime feedback.
- Periodic worker sweeps ensure manifests exist/regenerate when codecs change.

## Playback Flow

- Frontend keeps single `AudioContext`/`HTMLAudioElement` fed by HLS URLs via MediaSource/hls.js.
- When clicking play, client calls `/tracks/:id/stream` to obtain manifest, then hands to player.
- Optionally warm up: when fetching first page, also prefetch manifest URLs to reduce latency.

## Additional Notes

- Keep metadata API and media storage decoupled for scale and security.
- Consider caching list API responses at edge or using HTTP conditional requests.
- For environments lacking FFmpeg (Workers), offload processing to queue consumer on VM/Cloud Run.
