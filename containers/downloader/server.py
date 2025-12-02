import asyncio
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DownloadTool = Literal["yt-dlp", "spotdl", "scdl"]
JobStatus = Literal["pending", "running", "completed", "failed", "skipped"]

DOWNLOAD_ROOT = Path(os.environ.get("DOWNLOAD_ROOT", "/app/downloads"))
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
        )


class DownloadManager:
    def __init__(self) -> None:
        self.jobs: Dict[str, Job] = {}
        self.lock = asyncio.Lock()

    async def create_job(self, request: DownloadRequest) -> Job:
        tool = request.tool or self._guess_tool(request.source)
        output_dir = DOWNLOAD_ROOT
        output_template = request.output or "%(title)s.%(ext)s"
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
            if job.tool == "yt-dlp":
                cmd = [
                    "yt-dlp",
                    "--newline",
                    "--ignore-errors",
                    "--no-overwrites",
                    "-P",
                    str(DOWNLOAD_ROOT),
                    "-o",
                    str(job.output.name),
                    job.source,
                ]
            elif job.tool == "spotdl":
                cmd = [
                    "spotdl",
                    "download",
                    job.source,
                    "--output",
                    str(job.output),
                    "--overwrite",
                    "skip",
                ]
            else:
                cmd = [
                    "scdl",
                    "-l",
                    job.source,
                    "-o",
                    str(DOWNLOAD_ROOT),
                    "--no-playlist-folder",
                    "--overwrite",
                    "skip",
                ]

            await self._execute(job, cmd)
            if job.status not in ("failed", "skipped"):
                job.status = "completed"
                job.finished_at = datetime.utcnow()
        except Exception as error:  # noqa: BLE001
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.message = f"error: {error}"

    async def _execute(self, job: Job, cmd: List[str]) -> None:
        # Quick skip if output exists.
        target_pattern = job.output
        existing = list(DOWNLOAD_ROOT.glob(target_pattern.name))
        if existing:
            job.status = "skipped"
            job.finished_at = datetime.utcnow()
            job.output_path = str(existing[0])
            job.message = "skipped: file already exists"
            return

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        assert process.stdout
        async for raw_line in process.stdout:
            line = raw_line.decode("utf-8", errors="ignore").strip()
            if line:
                job.message = line
                job.progress = self._infer_progress(line, job.progress)

        returncode = await process.wait()
        if returncode != 0:
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.message = f"exited with {returncode}"
        else:
            # Best-effort guess: set output_path to first matching file
            matches = list(DOWNLOAD_ROOT.glob(target_pattern.name))
            if matches:
                job.output_path = str(matches[0])
            job.message = "completed"

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
        lowered = source.lower()
        if "spotify" in lowered:
            return "spotdl"
        if "soundcloud" in lowered:
            return "scdl"
        return "yt-dlp"


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
