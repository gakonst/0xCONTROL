"""
Minimal CLI to exercise the downloader locally via the unified library
(`unified_downloader.run_download`) so all tools share the same progress flow.

Examples:
  uv run --python .venv/bin/python containers/downloader/cli.py https://youtube.com/watch?v=abc123
  uv run --python .venv/bin/python containers/downloader/cli.py https://open.spotify.com/track/... --tool spotdl
  uv run --python .venv/bin/python containers/downloader/cli.py https://soundcloud.com/... --output "{title}"
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from pathlib import Path
from typing import Optional

# Ensure local module resolution when run directly.
sys.path.append(str(Path(__file__).parent))
from unified_downloader import guess_tool, run_download

# Ensure a writable default download directory when run locally.
os.environ.setdefault("DOWNLOAD_ROOT", str(Path.cwd() / "downloads"))


class ProgressReporter:
    """Lightweight cross-tool progress printer with heartbeat."""

    def __init__(self) -> None:
        self.last_line: str = ""
        self.last_update: float = time.time()
        self._stop = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None

    def update(self, tool: str, percent: Optional[float], detail: dict) -> None:
        message = detail.get("text") or detail.get("stage", "")
        pct_display = f"{percent:5.1f}%" if percent is not None else "   n/a"
        line = f"[{tool:6}] {pct_display} {message}".rstrip()
        if line != self.last_line:
            print(line, end="\r")
            self.last_line = line
        self.last_update = time.time()

    def start_heartbeat(self, label: str) -> None:
        def loop() -> None:
            while not self._stop.is_set():
                time.sleep(1)
                if time.time() - self.last_update > 5:
                    print(f"[{label:6}] working...", end="\r")
                    self.last_update = time.time()

        self._heartbeat_thread = threading.Thread(target=loop, daemon=True)
        self._heartbeat_thread.start()

    def done(self) -> None:
        if self.last_line:
            print()
        self._stop.set()
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=1)
        self.last_line = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download a track or playlist via the downloader libraries.")
    parser.add_argument("source", help="URL or search/query for yt-dlp/spotdl/scdl")
    parser.add_argument(
        "--tool",
        choices=["yt-dlp", "spotdl", "scdl"],
        help="Optional explicit tool override; otherwise auto-detected.",
    )
    parser.add_argument(
        "--output",
        help="Optional output template or path (defaults to %(title)s.%(ext)s template).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    reporter = ProgressReporter()
    tool = args.tool or guess_tool(args.source)
    output_template = args.output or "%(title)s.%(ext)s"
    target_dir = Path(os.environ["DOWNLOAD_ROOT"])
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"Using tool={tool} -> {args.source}")
    reporter.start_heartbeat(tool)

    ok, path, err = run_download(
        tool=tool,
        source=args.source,
        output_template=output_template,
        download_root=target_dir,
        progress_cb=lambda pct, detail: reporter.update(tool, pct, detail),
    )

    reporter.done()

    if ok:
        print(f"Done: {path or 'completed'}")
        raise SystemExit(0)

    print(f"Failed to download. {err or ''}".strip())
    raise SystemExit(1)


if __name__ == "__main__":
    main()
