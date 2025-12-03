import asyncio
import os
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Ensure local module resolution when run via uvicorn.
sys.path.append(str(Path(__file__).parent))
from unified_downloader import guess_tool, run_download

DownloadTool = Literal["yt-dlp", "spotdl"]
JobStatus = Literal["pending", "running", "completed", "failed", "skipped"]

DEFAULT_DOWNLOAD_ROOT = Path(__file__).parent / "downloads"
DOWNLOAD_ROOT = Path(os.environ.get("DOWNLOAD_ROOT", DEFAULT_DOWNLOAD_ROOT))
DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)


class DownloadRequest(BaseModel):
    source: str = Field(..., description="URL or query for the track or playlist")
    tool: Optional[DownloadTool] = Field(
        None, description="Explicit tool override. Defaults to auto-detection."
    )
    output: Optional[str] = Field(
        None,
        description="Optional output template or directory. Defaults to downloads root",
    )


class JobProgress(BaseModel):
    id: str
    source: str
    tool: DownloadTool
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    output_path: Optional[str] = None
    message: Optional[str] = None
    progress: float = 0.0
    stage: Optional[str] = None
    downloaded_bytes: Optional[int] = None
    total_bytes: Optional[int] = None
    speed_bytes: Optional[float] = None
    speed: Optional[str] = None
    eta_seconds: Optional[int] = None
    eta: Optional[str] = None
    track: Optional[str] = None
    error: Optional[str] = None


@dataclass
class Job:
    id: str
    source: str
    tool: DownloadTool
    output: Path
    status: JobStatus = "pending"
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    output_path: Optional[str] = None
    message: Optional[str] = None
    progress: float = 0.0
    stage: Optional[str] = None
    downloaded_bytes: Optional[int] = None
    total_bytes: Optional[int] = None
    speed_bytes: Optional[float] = None
    speed: Optional[str] = None
    eta_seconds: Optional[int] = None
    eta: Optional[str] = None
    track: Optional[str] = None
    error: Optional[str] = None
    task: Optional[asyncio.Task] = None

    def to_progress(self) -> JobProgress:
        return JobProgress(
            id=self.id,
            source=self.source,
            tool=self.tool,
            status=self.status,
            created_at=self.created_at,
            started_at=self.started_at,
            finished_at=self.finished_at,
            output_path=self.output_path,
            message=self.message,
            progress=self.progress,
            stage=self.stage,
            downloaded_bytes=self.downloaded_bytes,
            total_bytes=self.total_bytes,
            speed_bytes=self.speed_bytes,
            speed=self.speed,
            eta_seconds=self.eta_seconds,
            eta=self.eta,
            track=self.track,
            error=self.error,
        )


class DownloadManager:
    def __init__(self) -> None:
        self.jobs: Dict[str, Job] = {}
        self.lock = asyncio.Lock()

    async def create_job(self, request: DownloadRequest) -> Job:
        tool = request.tool or self._guess_tool(request.source)
        output_template = request.output or self._default_template(tool)
        output_dir = DOWNLOAD_ROOT
        job = Job(
            id=str(uuid.uuid4()),
            source=request.source,
            tool=tool,
            output=output_dir / output_template,
        )

        async with self.lock:
            self.jobs[job.id] = job
            job.task = asyncio.create_task(self._run_job(job))
        return job

    async def get_job(self, job_id: str) -> Optional[Job]:
        async with self.lock:
            return self.jobs.get(job_id)

    async def list_jobs(self) -> List[Job]:
        async with self.lock:
            return list(self.jobs.values())

    async def _run_job(self, job: Job) -> None:
        job.started_at = datetime.utcnow()
        job.status = "running"
        try:
            await self._execute(job)
            if job.status not in ("failed", "skipped"):
                job.status = "completed"
                job.finished_at = datetime.utcnow()
        except Exception as error:  # noqa: BLE001
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.message = f"error: {error}"

    async def _execute(self, job: Job) -> None:
        # Quick skip if output exists.
        target_pattern = job.output
        existing = list(DOWNLOAD_ROOT.glob(target_pattern.name))
        if existing:
            job.status = "skipped"
            job.finished_at = datetime.utcnow()
            job.output_path = str(existing[0])
            job.message = "skipped: file already exists"
            return

        def progress_cb(percent: Optional[float], detail: dict | str) -> None:
            if isinstance(detail, dict):
                job.message = detail.get("text") or detail.get("stage") or job.message
                job.stage = detail.get("stage", job.stage)
                job.downloaded_bytes = detail.get("downloaded_bytes", job.downloaded_bytes)
                job.total_bytes = detail.get("total_bytes", job.total_bytes)
                job.speed_bytes = detail.get("speed_bytes", job.speed_bytes)
                job.speed = detail.get("speed", job.speed)
                job.eta_seconds = detail.get("eta_seconds", job.eta_seconds)
                job.eta = detail.get("eta", job.eta)
                job.track = detail.get("track", job.track)
                job.error = detail.get("error", job.error)
            else:
                job.message = str(detail)
            if percent is not None:
                job.progress = percent

        success, path, err = await asyncio.to_thread(
            run_download,
            job.tool,
            job.source,
            job.output.name,
            DOWNLOAD_ROOT,
            progress_cb,
        )

        if success:
            job.output_path = path
            job.message = "completed"
        else:
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.message = err or "failed"
            job.progress_detail = job.progress_detail or {"stage": "failed", "error": job.message}

    def _infer_progress(self, line: str, previous: float) -> float:
        if "%" in line:
            try:
                # yt-dlp prints like "[download]  42.0% of ..."
                percent = line.split("%", 1)[0].split()[-1]
                return float(percent)
            except Exception:
                return previous
        return previous

    def _guess_tool(self, source: str) -> DownloadTool:
        return guess_tool(source)  # type: ignore[return-value]

    def _default_template(self, tool: DownloadTool) -> str:
        if tool == "yt-dlp":
            return "%(title)s.%(ext)s"
        if tool == "spotdl":
            return "{artists} - {title}.{output-ext}"
        return "{title}"


manager = DownloadManager()
app = FastAPI(title="Universal Downloader", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/download", response_model=JobProgress)
async def download(payload: DownloadRequest) -> JobProgress:
    job = await manager.create_job(payload)
    return job.to_progress()


@app.get("/progress", response_model=List[JobProgress])
async def progress() -> List[JobProgress]:
    jobs = await manager.list_jobs()
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    return [job.to_progress() for job in jobs]


@app.get("/progress/{job_id}", response_model=JobProgress)
async def job_detail(job_id: str) -> JobProgress:
    job = await manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job.to_progress()


@app.get("/jobs", response_model=List[JobProgress])
async def jobs() -> List[JobProgress]:
    return await progress()
