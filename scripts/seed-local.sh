#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v bunx >/dev/null 2>&1; then
  echo "bunx is required to seed local resources." >&2
  exit 1
fi

TRACKS_DIR="${ROOT_DIR}/tracks"

seed_d1() {
  echo "Seeding local D1 database..."
  bunx wrangler d1 execute zero-control-tracks --local --file=./d1/schema.sql
  bunx wrangler d1 execute zero-control-tracks --local --file=./d1/seed.sql
}

seed_r2_bucket() {
  local bucket_name="$1"
  echo "Seeding R2 bucket: ${bucket_name}"

  find "${TRACKS_DIR}" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.m4a' \) -print0 |
    while IFS= read -r -d '' track_file; do
      local key
      key="$(basename "${track_file}")"
      echo "  -> ${key}"
      bunx wrangler r2 object put "${bucket_name}/${key}" --file="${track_file}" --local
    done
}

seed_d1
seed_r2_bucket "zero-control-tracks"
seed_r2_bucket "zero-control-tracks-preview"

echo "Local D1/R2 resources are ready."
