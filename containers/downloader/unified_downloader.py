"""
Unified, in-process download helpers for yt-dlp and spotdl (soundcloud uses yt-dlp).
progress_cb signature: (percent: Optional[float], detail: dict) -> None
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, Optional, Tuple, Dict, Any

from yt_dlp import YoutubeDL  # type: ignore
from yt_dlp.utils import format_bytes, formatSeconds  # type: ignore

from spotdl.download.downloader import Downloader  # type: ignore
from spotdl.types.song import Song  # type: ignore
from spotdl.utils.config import DEFAULT_CONFIG as SPOTDL_DEFAULTS  # type: ignore
from spotdl.utils.search import get_search_results  # type: ignore
from spotdl.utils.spotify import SpotifyClient  # type: ignore

ProgressCb = Callable[[Optional[float], Dict[str, Any]], None]


def run_download(
    tool: str,
    source: str,
    output_template: Optional[str],
    download_root: Path,
    progress_cb: ProgressCb,
) -> Tuple[bool, Optional[str], Optional[str]]:
    tool = tool or guess_tool(source)
    download_root.mkdir(parents=True, exist_ok=True)
    template = _normalize_template(tool, output_template)

    if tool == "yt-dlp":
        return _run_ytdlp(source, download_root, template, progress_cb)
    if tool == "spotdl":
        return _run_spotdl(source, download_root, template, progress_cb)

    return False, None, f"unknown tool: {tool}"


def _run_ytdlp(
    source: str, download_root: Path, template: str, progress_cb: ProgressCb
) -> Tuple[bool, Optional[str], Optional[str]]:
    last_filename: Optional[str] = None
    cookie_file = os.environ.get("YTDLP_COOKIES")
    use_po = os.environ.get("YTDLP_PO_TOKEN")

    progress_cb(0.0, {"stage": "starting"})
    before = {p.name for p in download_root.glob("*")}

    def hook(status: dict) -> None:
        nonlocal last_filename
        if status.get("filename"):
            last_filename = status["filename"]
        if status.get("status") == "downloading":
            downloaded = status.get("downloaded_bytes") or 0
            total = status.get("total_bytes") or status.get("total_bytes_estimate")
            pct = (downloaded / total * 100) if total else None
            speed_bytes = status.get("speed")
            speed_str = f"{format_bytes(speed_bytes)}/s" if speed_bytes else "n/a"
            eta_val = status.get("eta")
            eta_str = formatSeconds(eta_val) if eta_val is not None else "n/a"
            detail = {
                "stage": "downloading",
                "downloaded_bytes": downloaded,
                "total_bytes": total,
                "speed_bytes": speed_bytes,
                "speed": speed_str,
                "eta_seconds": eta_val,
                "eta": eta_str,
            }
            progress_cb(pct, detail)
        elif status.get("status") == "finished":
            progress_cb(100.0, {"stage": "finished"})

    class _SilentLogger:
        def debug(self, *args, **kwargs): ...
        def info(self, *args, **kwargs): ...
        def warning(self, *args, **kwargs): ...
        def error(self, *args, **kwargs): ...
        def fatal(self, *args, **kwargs): ...
        def critical(self, *args, **kwargs): ...

    ydl_opts = {
        "outtmpl": {"default": str(download_root / template)},
        "paths": {"home": str(download_root)},
        "progress_hooks": [hook],
        "logger": _SilentLogger(),
        "quiet": True,
        "no_warnings": True,
        "noprogress": False,
        "progress_with_newline": True,
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "0",
            }
        ],
        "continuedl": False,
        "force_overwrites": True,
        **({"source_address": "0.0.0.0"} if os.environ.get("YTDLP_IPV4") else {}),
    }
    if cookie_file:
        ydl_opts["cookiefile"] = cookie_file
    if use_po:
        client, token = use_po.split("+", 1)
        ydl_opts.setdefault("extractor_args", {}).setdefault("youtube", {})["po_token"] = [
            f"{client}+{token}"
        ]
    if env_args := os.environ.get("YTDLP_EXTRACTOR_ARGS"):
        ydl_opts["extractor_args"] = {
            "youtube": {k: v.split(",") for k, v in _parse_extractor_args(env_args).items()}
        }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            result = ydl.download([source])
        success = result == 0

        after_files = list(download_root.glob("*"))
        new_files = [p for p in after_files if p.name not in before]
        final_path: Optional[str] = None

        if new_files:
            mp3s = [p for p in new_files if p.suffix.lower() == ".mp3"]
            if mp3s:
                final_path = str(sorted(mp3s, key=lambda p: p.stat().st_mtime, reverse=True)[0])
            else:
                final_path = str(sorted(new_files, key=lambda p: p.stat().st_mtime, reverse=True)[0])
        elif last_filename:
            cand = Path(last_filename).with_suffix(".mp3")
            final_path = str(cand) if cand.exists() else last_filename

        if success:
            return True, final_path, None
        return False, final_path, "yt-dlp failed"
    except Exception as exc:  # noqa: BLE001
        return False, last_filename, f"yt-dlp error: {exc}"


def _run_spotdl(
    source: str, download_root: Path, template: str, progress_cb: ProgressCb
) -> Tuple[bool, Optional[str], Optional[str]]:
    progress_cb(0.0, {"stage": "starting"})
    try:
        SpotifyClient.init(
            client_id=SPOTDL_DEFAULTS["client_id"],
            client_secret=SPOTDL_DEFAULTS["client_secret"],
            user_auth=False,
            no_cache=True,
        )
    except Exception as exc:  # noqa: BLE001
        return False, None, f"spotdl spotify init failed: {exc}"

    settings = {
        "output": str(download_root / template),
        "threads": 1,
        "ffmpeg": "ffmpeg",
        "simple_tui": True,
        "print_errors": True,
        "load_config": False,
        "log_level": "ERROR",
    }

    def spotdl_cb(tracker, message):
        detail = {"stage": message or "running", "track": tracker.song_name}
        progress_cb(float(tracker.progress), detail)

    downloader = Downloader(settings=settings)
    downloader.progress_handler.update_callback = spotdl_cb

    songs = [Song.from_url(source)] if source.startswith("http") else get_search_results(source)

    try:
        results = downloader.download_multiple_songs(songs)
    except SystemExit as exc:  # raised internally on fatal errors
        return False, None, f"spotdl exited with code {exc.code}"
    except Exception as exc:  # noqa: BLE001
        return False, None, f"spotdl error: {exc}"

    for _, path in results:
        if path:
            return True, str(path), None

    return False, None, "spotdl produced no output path"


def guess_tool(source: str) -> str:
    lowered = source.lower()
    if "spotify" in lowered:
        return "spotdl"
    # everything else (including soundcloud) goes through yt-dlp
    return "yt-dlp"


def _normalize_template(tool: str, user_template: Optional[str]) -> str:
    if tool == "yt-dlp":
        return user_template or "%(title)s.%(ext)s"
    if tool == "spotdl":
        if user_template and "{" in user_template:
            return user_template
        return "{artists} - {title}.{output-ext}"
    return "%(title)s.%(ext)s"


def _parse_extractor_args(raw: str) -> dict:
    parts = raw.split(":", 1)
    if len(parts) != 2:
        return {}
    _, args_part = parts
    result = {}
    for kv in args_part.split(","):
        if "=" in kv:
            k, v = kv.split("=", 1)
            result[k.strip()] = v.strip()
    return result
