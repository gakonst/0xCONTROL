# 0xControl

0xControl is a mobile-first music library for listening to, annotating, and
organizing a Rekordbox collection on the go. The UI is a PWA backed by a
Cloudflare Worker, D1 playlist metadata, and R2 audio storage.

## Product surface

- Browse and search the full track library.
- Play tracks with waveform, Media Session, and playlist-aware next/previous.
- Add color and text annotations that persist to the catalog.
- Create, edit, pin, delete, and reorder playlists and their tracks.
- Download individual original files or a whole playlist as an ordered,
  server-streamed ZIP.

The Rekordbox TypeScript port and agentic downloader are deliberately separate
systems. They integrate through the catalog/playlist API and storage model; the
refresh action makes external writes visible without coupling those services to
the mobile UI. The concrete boundary is documented in
[`docs/integrations.md`](docs/integrations.md).

## Design system

Semantic tokens live in `src/index.css`, reusable controls live in
`src/components/ui`, and the interaction rules are documented in
`src/design-system/README.md`. Product screens compose those primitives so
touch targets, safe areas, states, and progressive disclosure stay consistent.

## Development

This project uses Bun.

```bash
bun install
cp .dev.vars.example .dev.vars
./dev.sh
bun run build
```

For production builds, Vite loads `.env.production` for the API base URL. Keep
local overrides in `.env.local`.

```bash
bun run deploy
```

The API fails closed until `SONG_PASSWORD` is configured. Use `.dev.vars` for
local Worker development and `bunx wrangler secret put SONG_PASSWORD` for the
hosted Worker. The passcode creates a secure, HTTP-only, same-site session; it
is never stored in the browser bundle or committed configuration.

The worker download routes are:

- `GET /api/tracks/:trackId/download`
- `GET /api/playlists/:playlistId/download`

Playlist ZIPs preserve playlist order, sanitize filenames, stream R2 objects
without buffering the archive in the browser, and include a missing-tracks text
file if an object disappears from storage.
