from __future__ import annotations

from typing import Optional


def normalize_bpm(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if value == 0:
        return None
    if value >= 1000:
        return round(value / 100, 2)
    return round(value, 2)
