# Local R2 Dev Setup (workers-sdk #3687 workaround)

This project uses the unofficial **cloudflare-r2-dev-server** to expose the local Miniflare R2 state over HTTP so tracks load during `wrangler dev`.

## One-command workflow
Run:
```sh
scripts/dev-with-r2.sh
```
What it does:
- Clones `cloudflare-r2-dev-server` (if missing) and installs deps.
- Finds the preview bucket sqlite (`zero-control-tracks-preview`) under `.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite`.
- Writes `cloudflare-r2-dev-server/.env` with `R2_BUCKET_DATABASE_NAME` (and legacy `R2_BUCKET_DABASE_NAME`), bucket name, state path, and port (default 3002).
- Updates `.env.local` with `VITE_R2_DEV_SERVER_URL=http://localhost:3002`.
- Starts the R2 dev server + `bunx wrangler dev --local` in parallel; logs to `.r2-dev-server.log` and `.wrangler-dev.log`.

Stop: Ctrl+C (script traps both processes).

## Options
- Change port: `PORT=3004 scripts/dev-with-r2.sh`
- Configure only (no servers): `DEV_WITH_R2_SETUP_ONLY=1 scripts/dev-with-r2.sh`
- If you already know the sqlite hash: `R2_BUCKET_DATABASE_NAME=<hash> scripts/dev-with-r2.sh`

## Known good curl check
```sh
curl -I "http://localhost:3002/Booka%20Shade%2C%20Eli%20%26%20Fur%2C%20Einmusik%20-%20To%20the%20Sea%20-%20Einmusik%20Remix.mp3"
# Expect: HTTP/1.1 200 OK
```

## Code changes made
- `scripts/dev-with-r2.sh`: robust bucket/sqlite detection, sets both env var spellings, background process handling, optional setup-only mode.
- `cloudflare-r2-dev-server/src/index.ts`: tolerant key matching (decoded/encoded, spaces, commas, ampersands) so R2 objects resolve correctly.
