# pyrekordbox sync helper

`pyrekordbox_sync.py` mirrors Cloudflare D1 metadata and R2 track objects into a
pyrekordbox-friendly SQLite database on your laptop. It optionally copies the
library + analysis artifacts onto a mounted USB/SD drive for stand‑alone
hardware use.

## Requirements
- Python 3.10+
- `requests` (HTTP fetches)
- `boto3` (S3-compatible client for R2)
- `pyrekordbox` (database + analysis helper powering the mirror)

Install the dependencies locally with:

```bash
python -m pip install -r scripts/requirements.txt
```

## Running
```bash
python scripts/pyrekordbox_sync.py \
  --api-base-url https://example-worker.workers.dev \
  --r2-endpoint https://<account>.r2.cloudflarestorage.com \
  --r2-bucket zero-control-tracks \
  --r2-access-key "$R2_ACCESS_KEY_ID" \
  --r2-secret-key "$R2_SECRET_ACCESS_KEY" \
  --library-root ~/Music/zero-control \
  --rekordbox-db ~/Music/zero-control/pyrekordbox.sqlite \
  --usb-root /Volumes/REKORDBOX
```

The script will:
1. Pull tracks/playlists from the Worker API (`/api/catalog`, `/api/playlists`).
2. Download audio from the R2 bucket into `--library-root`.
3. Mirror metadata into the supplied SQLite path.
4. Fetch waveform analysis (`/api/analyze`) and emit compressed `.anlz` files next to the audio.
5. Copy tracks + database (and `.anlz` files) onto the USB root if present.

Use `--skip-anlz` when you only want database + audio sync without creating the
analysis sidecars.
