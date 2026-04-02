"""Store original resume PDFs on disk (one file per candidate)."""
from __future__ import annotations

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_ROOT / "uploads" / "resumes"

MAX_BYTES = 15 * 1024 * 1024


def ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def path_for(candidate_id: str) -> Path:
    return UPLOAD_DIR / f"{candidate_id}.pdf"


def write_pdf(candidate_id: str, data: bytes) -> None:
    ensure_upload_dir()
    path_for(candidate_id).write_bytes(data)


def delete_pdf_if_exists(candidate_id: str) -> None:
    p = path_for(candidate_id)
    if p.is_file():
        p.unlink()


def is_valid_pdf_header(data: bytes) -> bool:
    return len(data) >= 5 and data.startswith(b"%PDF")
