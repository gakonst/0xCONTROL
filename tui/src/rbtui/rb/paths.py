from __future__ import annotations

from pathlib import Path
from typing import Optional

AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".flac",
    ".aiff",
    ".m4a",
    ".aac",
    ".ogg",
}


def resolve_audio_path(folder_path: Optional[str], file_name: Optional[str], org_folder: Optional[str]) -> Optional[Path]:
    candidates = []
    if folder_path:
        folder = Path(folder_path).expanduser()
        if folder.suffix.lower() in AUDIO_EXTENSIONS:
            candidates.append(folder)
        elif file_name:
            candidates.append(folder / file_name)
    if org_folder and file_name:
        candidates.append(Path(org_folder).expanduser() / file_name)

    for candidate in candidates:
        try:
            if candidate.exists():
                return candidate.resolve()
        except OSError:
            continue
    return None
