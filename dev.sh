#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# Unified dev runner: R2 helper, Wrangler dev, and Vite web app.
# - Updates R2 helper config automatically.
# - Ensures conflicting processes on key ports are terminated before start.
# Ports can be overridden via R2_PORT/PORT, WRANGLER_PORT, WEB_PORT env vars.

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
R2_HELPER_DIR="${ROOT_DIR}/cloudflare-r2-dev-server"
TRACKS_DIR="/Users/gakonst/projects/0xCONTROL/tracks"
WRANGLER_TOML="${ROOT_DIR}/wrangler.toml"
R2_STATE_DIR="${ROOT_DIR}/.wrangler/state/v3/r2"
R2_SQLITE_DIR="${R2_STATE_DIR}/miniflare-R2BucketObject"

# Port selection (keep PORT for backward compatibility with the old script)
R2_PORT="${PORT:-${R2_PORT:-3002}}"
WRANGLER_PORT="${WRANGLER_PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"
WEB_HOST="${WEB_HOST:-0.0.0.0}"

for cmd in bun sqlite3 lsof tmux; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd is required" >&2; exit 1; }
done

# Kill any process currently listening on the given port to avoid conflicts.
kill_port_processes() {
  local port="$1" label="$2"
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Killing existing $label on port $port (pids: $pids)"
    kill $pids 2>/dev/null || true
    sleep 1
    # Force kill if still alive
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
  fi
}

# Extract preview bucket name from wrangler.toml
PREVIEW_BUCKET_NAME="$(grep -E "preview_bucket_name" "$WRANGLER_TOML" | sed -E 's/.*"([^"]+)"/\1/' | head -1)"
if [[ -z "$PREVIEW_BUCKET_NAME" ]]; then
  echo "Could not find preview_bucket_name in wrangler.toml" >&2
  exit 1
fi

mkdir -p "$R2_HELPER_DIR"

# Clone helper if missing
if [[ ! -d "$R2_HELPER_DIR/.git" ]]; then
  echo "(Re)installing cloudflare-r2-dev-server helper..."
  rm -rf "$R2_HELPER_DIR"
  git clone https://github.com/emilienbidet/cloudflare-r2-dev-server "$R2_HELPER_DIR"
else
  echo "Updating cloudflare-r2-dev-server helper..."
  git -C "$R2_HELPER_DIR" fetch --all --quiet || true
  git -C "$R2_HELPER_DIR" pull --ff-only --quiet || true
fi

pushd "$R2_HELPER_DIR" >/dev/null
  echo "Ensuring helper dependencies..."
  bun install
popd >/dev/null

# Choose the sqlite backing the preview bucket by checking blob ids
pick_sqlite_for_bucket() {
  local bucket="$1"
  for db in "$R2_SQLITE_DIR"/*.sqlite; do
    [[ -f "$db" ]] || continue
    local blob_id
    blob_id=$(sqlite3 "$db" "SELECT blob_id FROM _mf_objects LIMIT 1;") || continue
    [[ -n "$blob_id" ]] || continue
    if [[ -f "$R2_STATE_DIR/$bucket/blobs/$blob_id" ]]; then
      basename "$db" .sqlite
      return 0
    fi
  done
  return 1
}

DB_NAME="${R2_BUCKET_DATABASE_NAME:-${R2_BUCKET_DABASE_NAME:-}}"
if [[ -z "$DB_NAME" ]]; then
  if ! DB_NAME=$(pick_sqlite_for_bucket "$PREVIEW_BUCKET_NAME"); then
    # Try non-preview bucket as a fallback
    ALT_BUCKET="${PREVIEW_BUCKET_NAME%-preview}"
    if [[ "$ALT_BUCKET" != "$PREVIEW_BUCKET_NAME" ]]; then
      DB_NAME=$(pick_sqlite_for_bucket "$ALT_BUCKET") || true
    fi
  fi

  if [[ -z "$DB_NAME" ]]; then
    newest_db=$(ls -1t "$R2_SQLITE_DIR"/*.sqlite 2>/dev/null | head -1)
    if [[ -n "$newest_db" ]]; then
      DB_NAME="$(basename "$newest_db" .sqlite)"
      echo "Could not match bucket; falling back to newest R2 sqlite: $DB_NAME" >&2
    else
      echo "Could not determine R2 bucket sqlite backing file" >&2
      exit 1
    fi
  fi
fi

# Write helper .env
cat > "$R2_HELPER_DIR/.env" <<EOF
R2_BUCKET_NAME="$PREVIEW_BUCKET_NAME"
R2_BUCKET_DATABASE_NAME="$DB_NAME"
# legacy typo kept for compatibility with older helper revisions
R2_BUCKET_DABASE_NAME="$DB_NAME"
R2_BUCKET_PATH="$R2_STATE_DIR/"
PORT="$R2_PORT"
TRACKS_DIR="$TRACKS_DIR"
EOF

echo "Helper .env configured: bucket=$PREVIEW_BUCKET_NAME db=$DB_NAME port=$R2_PORT"

# Ensure frontend picks the dev server URL
ENV_LOCAL="$ROOT_DIR/.env.local"
if grep -q '^VITE_R2_DEV_SERVER_URL=' "$ENV_LOCAL" 2>/dev/null; then
  sed -i '' "s|^VITE_R2_DEV_SERVER_URL=.*|VITE_R2_DEV_SERVER_URL=http://localhost:${R2_PORT}|" "$ENV_LOCAL"
else
  echo "VITE_R2_DEV_SERVER_URL=http://localhost:${R2_PORT}" >> "$ENV_LOCAL"
fi

echo "Updated ${ENV_LOCAL} with VITE_R2_DEV_SERVER_URL=http://localhost:${R2_PORT}"

if [[ "${DEV_WITH_R2_SETUP_ONLY:-0}" == "1" || "${DEV_SETUP_ONLY:-0}" == "1" ]]; then
  echo "Setup complete; skipping process start (DEV_WITH_R2_SETUP_ONLY/DEV_SETUP_ONLY=1)."
  exit 0
fi

# Clear conflicting listeners before starting new ones
kill_port_processes "$R2_PORT" "R2 dev server"
kill_port_processes "$WRANGLER_PORT" "wrangler dev"
kill_port_processes "$WEB_PORT" "Vite dev server"

# Start processes
R2_LOG="$ROOT_DIR/.r2-dev-server.log"
WRANGLER_LOG="$ROOT_DIR/.wrangler-dev.log"
WEB_LOG="$ROOT_DIR/.vite-dev.log"
R2_PID=""
WRANGLER_PID=""
WEB_PID=""
TMUX_LOG_SESSION=""
declare -a TMUX_LOG_PANES=()

cleanup() {
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "${WRANGLER_PID:-}" ]] && kill "$WRANGLER_PID" 2>/dev/null || true
  [[ -n "${R2_PID:-}" ]] && kill "$R2_PID" 2>/dev/null || true

  # Tear down any tmux panes/session we spawned for logs.
  if [[ -n "${TMUX_LOG_SESSION:-}" ]]; then
    tmux kill-session -t "$TMUX_LOG_SESSION" >/dev/null 2>&1 || true
  fi

  if [[ ${#TMUX_LOG_PANES[@]} -gt 0 ]]; then
    for pane in "${TMUX_LOG_PANES[@]}"; do
      tmux kill-pane -t "$pane" >/dev/null 2>&1 || true
    done
  fi
}
trap cleanup EXIT INT TERM

echo "Starting R2 dev server on port ${R2_PORT}... (logs: $R2_LOG)"
(cd "$R2_HELPER_DIR" && PORT="$R2_PORT" bun run start >"$R2_LOG" 2>&1) &
R2_PID=$!

echo "Starting wrangler dev with R2 dev server... (logs: $WRANGLER_LOG)"
(cd "$ROOT_DIR" && VITE_R2_DEV_SERVER_URL="http://localhost:${R2_PORT}" bunx wrangler dev --local --port "$WRANGLER_PORT" "$@" >"$WRANGLER_LOG" 2>&1) &
WRANGLER_PID=$!

echo "Starting Vite web dev server on port ${WEB_PORT}... (logs: $WEB_LOG)"
(cd "$ROOT_DIR" && VITE_R2_DEV_SERVER_URL="http://localhost:${R2_PORT}" bun run dev -- --host "$WEB_HOST" --port "$WEB_PORT" >"$WEB_LOG" 2>&1) &
WEB_PID=$!

# Spawn/refresh a tmux window with three log panes
launch_tmux_logs() {
  local target_window="dev-logs"
  local base_cmd="tail -n 50 -F"

  if [[ -n "${TMUX:-}" ]]; then
    # Inside tmux: split the current window instead of creating a new one
    local current_pane
    current_pane="$(tmux display-message -p '#{pane_id}')"

    local created=()

    # R2 log on the right
    created+=("$(tmux split-window -h -P -F '#{pane_id}' "${base_cmd} '$R2_LOG'")")

    # Keep splitting the original pane so the logs stay together
    tmux select-pane -t "$current_pane"
    created+=("$(tmux split-window -v -P -F '#{pane_id}' "${base_cmd} '$WRANGLER_LOG'")")

    tmux select-pane -t "$current_pane"
    created+=("$(tmux split-window -v -P -F '#{pane_id}' "${base_cmd} '$WEB_LOG'")")

    tmux select-layout tiled >/dev/null
    tmux select-pane -t "$current_pane"

    TMUX_LOG_PANES=("${created[@]}")
    TMUX_LOG_SESSION=""
  else
    # Detached session so users can attach manually
    tmux kill-session -t "$target_window" >/dev/null 2>&1 || true
    tmux new-session -d -s "$target_window" "${base_cmd} '$R2_LOG'"
    tmux split-window -h -t "$target_window" "${base_cmd} '$WRANGLER_LOG'"
    tmux split-window -v -t "$target_window" "${base_cmd} '$WEB_LOG'"
    tmux select-layout -t "$target_window" tiled >/dev/null
    echo "Logs available in tmux session '$target_window' (run: tmux attach -t $target_window)"

    TMUX_LOG_SESSION="$target_window"
    TMUX_LOG_PANES=()
  fi
}

launch_tmux_logs

echo "All services started. Press Ctrl+C to stop."
wait
