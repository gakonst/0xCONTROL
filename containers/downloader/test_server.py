import asyncio
import importlib.util
from pathlib import Path
from types import ModuleType

import pytest


@pytest.fixture()
def server_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """Load the downloader server module with DOWNLOAD_ROOT pointed at tmp_path."""

    monkeypatch.setenv("DOWNLOAD_ROOT", str(tmp_path))
    module_path = Path(__file__).parent / "server.py"
    spec = importlib.util.spec_from_file_location("downloader_server", module_path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive guard
        raise RuntimeError("unable to load server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_guess_tool_prefers_platform_keywords(server_module: ModuleType) -> None:
    manager = server_module.DownloadManager()

    assert manager._guess_tool("https://open.spotify.com/track/123") == "spotdl"
    assert manager._guess_tool("https://soundcloud.com/artist/track") == "yt-dlp"
    assert manager._guess_tool("https://youtube.com/watch?v=abc") == "yt-dlp"


def test_infer_progress_extracts_percentage(server_module: ModuleType) -> None:
    manager = server_module.DownloadManager()
    line = "[download]  42.5% of 10MiB at 2MiB/s ETA 00:02"

    progress = manager._infer_progress(line, 0.0)

    assert progress == pytest.approx(42.5)


@pytest.mark.asyncio()
async def test_execute_marks_skipped_when_output_exists(
    server_module: ModuleType, tmp_path: Path
) -> None:
    manager = server_module.DownloadManager()
    output_path = tmp_path / "track.mp3"
    output_path.write_text("already here")
    job = server_module.Job(
        id="job-1", source="https://example.com", tool="yt-dlp", output=output_path
    )

    await manager._execute(job)

    assert job.status == "skipped"
    assert job.output_path == str(output_path)
    assert job.message == "skipped: file already exists"


@pytest.mark.asyncio()
async def test_run_job_completes_and_tracks_progress(
    server_module: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager = server_module.DownloadManager()
    output_path = tmp_path / "download.mp3"
    job = server_module.Job(
        id="job-2",
        source="https://example.com/track",
        tool="yt-dlp",
        output=output_path,
    )

    async def fake_execute(target_job: server_module.Job) -> None:
        target_job.progress = 100.0
        target_job.output_path = str(output_path)

    monkeypatch.setattr(manager, "_execute", fake_execute)

    await manager._run_job(job)

    assert job.status == "completed"
    assert job.progress == 100.0
    assert job.output_path == str(output_path)
    assert job.started_at is not None
    assert job.finished_at is not None


# --- Integration downloads (real network) ---------------------------------- #


@pytest.mark.asyncio()
async def test_youtube_download_real(tmp_path: Path) -> None:
    from unified_downloader import run_download

    events: list[dict] = []

    def cb(pct: float | None, detail: dict) -> None:
        events.append(detail)

    success, path, err = await asyncio.to_thread(
        run_download,
        "yt-dlp",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "%(title)s.%(ext)s",
        tmp_path,
        cb,
    )

    assert success, f"yt-dlp failed: {err}"
    assert path is not None
    assert Path(path).exists()
    assert Path(path).suffix.lower() == ".mp3"
    assert events, "no progress events captured"


@pytest.mark.asyncio()
async def test_soundcloud_download_real(tmp_path: Path) -> None:
    from unified_downloader import run_download

    events: list[dict] = []

    def cb(pct: float | None, detail: dict) -> None:
        events.append(detail)

    success, path, err = await asyncio.to_thread(
        run_download,
        "yt-dlp",
        "https://soundcloud.com/spacemotion/space-motion-jes-call-my-2",
        "%(title)s.%(ext)s",
        tmp_path,
        cb,
    )

    assert success, f"soundcloud via yt-dlp failed: {err}"
    assert path is not None
    assert Path(path).exists()
    assert Path(path).suffix.lower() in {".mp3", ".m4a", ".webm", ".opus"}
    assert events, "no progress events captured"
