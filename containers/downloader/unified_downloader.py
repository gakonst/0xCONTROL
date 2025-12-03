"""
Unified, in-process download helpers for yt-dlp, spotdl, and scdl.

Provides:
    run_download(tool, source, output_template, download_root, progress_cb)

progress_cb signature: (percent: Optional[float], detail: dict) -> None
"""

from __future__ import annotations

import logging
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

from scdl.scdl import (  # type: ignore
    SoundCloud,
    SCDLArgs,
    download_url,
    search_soundcloud,
    validate_url,
)

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
    if tool == "scdl":
        return _run_scdl(source, download_root, template, progress_cb)

    return False, None, f"unknown tool: {tool}"


def _run_ytdlp(
    source: str, download_root: Path, template: str, progress_cb: ProgressCb
) -> Tuple[bool, Optional[str], Optional[str]]:
    last_filename: Optional[str] = None
    cookie_file = os.environ.get("YTDLP_COOKIES")
    use_po = os.environ.get("YTDLP_PO_TOKEN")

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
                "stage": status.get("status", "downloading"),
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
        "noprogress": True,
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

        final_path = last_filename
        if last_filename:
            cand = Path(last_filename).with_suffix(".mp3")
            if cand.exists():
                final_path = str(cand)
        else:
            mp3s = sorted(download_root.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
            if mp3s:
                final_path = str(mp3s[0])

        if success:
            return True, final_path, None
        return False, final_path, "yt-dlp failed"
    except Exception as exc:  # noqa: BLE001
        return False, last_filename, f"yt-dlp error: {exc}"


def _run_spotdl(
    source: str, download_root: Path, template: str, progress_cb: ProgressCb
) -> Tuple[bool, Optional[str], Optional[str]]:
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


def _run_scdl(
    source: str, download_root: Path, name_format: str, progress_cb: ProgressCb
) -> Tuple[bool, Optional[str], Optional[str]]:
    args = _build_scdl_args(source, download_root, name_format)
    client = SoundCloud(args["client_id"], args["auth_token"])

    logging.getLogger("scdl").setLevel(logging.ERROR)

    try:
        import scdl.scdl as scdl_mod  # type: ignore
        from tqdm import tqdm as real_tqdm  # type: ignore

        def tqdm_wrapper(*tq_args, **tq_kwargs):
            tq_kwargs["disable"] = True
            bar = real_tqdm(*tq_args, **tq_kwargs)
            orig_update = bar.update

            def update(n=1):
                res = orig_update(n)
                pct = (bar.n / bar.total * 100) if bar.total else None
                detail = {"stage": getattr(bar, "desc", None) or "downloading"}
                progress_cb(pct, detail)
                return res

            bar.update = update  # type: ignore
            return bar

        scdl_mod.tqdm = tqdm_wrapper  # type: ignore
    except Exception:
        pass

    try:
        if args["s"]:
            maybe_url = search_soundcloud(client, args["s"])
            if maybe_url:
                args["l"] = maybe_url
        args["l"] = validate_url(client, args["l"])
    except Exception as exc:  # noqa: BLE001
        return False, None, f"scdl invalid URL/search: {exc}"

    download_root.mkdir(parents=True, exist_ok=True)
    cwd = os.getcwd()
    os.chdir(download_root)

    try:
        download_url(client, args)
    except SystemExit as exc:
        os.chdir(cwd)
        return False, None, f"scdl exited with code {exc.code}"
    except Exception as exc:  # noqa: BLE001
        os.chdir(cwd)
        return False, None, f"scdl error: {exc}"

    os.chdir(cwd)

    files = sorted(
        (p for p in download_root.glob("*") if not p.name.endswith(".scdl.lock")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for lock in download_root.glob("*.scdl.lock"):
        lock.unlink(missing_ok=True)

    return True, str(files[0]) if files else None, None


def _build_scdl_args(source: str, download_root: Path, name_format: str) -> SCDLArgs:
    return {
        "C": False,
        "a": False,
        "add_description": False,
        "addtimestamp": False,
        "addtofile": False,
        "auth_token": None,
        "c": False,
        "client_id": None,
        "debug": False,
        "download_archive": None,
        "error": False,
        "extract_artist": False,
        "f": False,
        "flac": False,
        "force_metadata": False,
        "hide_progress": True,
        "hidewarnings": True,
        "l": source,
        "max_size": None,
        "me": False,
        "min_size": None,
        "n": None,
        "name_format": name_format,
        "no_album_tag": False,
        "no_original": False,
        "no_playlist": False,
        "no_playlist_folder": True,
        "o": None,
        "offset": 0,
        "only_original": False,
        "onlymp3": False,
        "opus": False,
        "original_art": False,
        "original_metadata": False,
        "original_name": False,
        "overwrite": False,
        "p": False,
        "path": str(download_root),
        "playlist_name_format": "{playlist[title]}_{title}",
        "r": False,
        "remove": False,
        "s": None,
        "strict_playlist": False,
        "sync": None,
        "t": False,
    }


def guess_tool(source: str) -> str:
    lowered = source.lower()
    if "spotify" in lowered:
        return "spotdl"
    if "soundcloud" in lowered:
        return "scdl"
    return "yt-dlp"


def _normalize_template(tool: str, user_template: Optional[str]) -> str:
    if tool == "yt-dlp":
        return user_template or "%(title)s.%(ext)s"
    if tool == "spotdl":
        if user_template and "{" in user_template:
            return user_template
        return "{artists} - {title}.{output-ext}"
    if user_template and "{" in user_template:
        return user_template
    if user_template and "%(title)" in user_template:
        return user_template.replace("%(title)s", "{title}").replace("%(ext)s", "")
    return "{title}"


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
