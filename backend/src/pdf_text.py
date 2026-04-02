"""Best-effort plain text extraction from PDF bytes (for LLM scoring / field extraction)."""
from __future__ import annotations

import os
import re
from io import BytesIO

# Enough text for LLM name extraction; below this we try PyMuPDF then optional OCR.
MIN_TEXT_CHARS = 80
# Max pages to OCR (avoid huge latency on long PDFs).
OCR_MAX_PAGES = 5


def _extract_pypdf(data: bytes, max_chars: int) -> str:
    if not data:
        return ""
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(BytesIO(data))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
        text = "\n".join(parts).strip()
        if len(text) > max_chars:
            return text[:max_chars]
        return text
    except Exception:
        return ""


def _extract_pymupdf(data: bytes, max_chars: int) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return ""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        parts: list[str] = []
        try:
            for page in doc:
                t = page.get_text()
                if t:
                    parts.append(t)
        finally:
            doc.close()
        text = "\n".join(parts).strip()
        if len(text) > max_chars:
            return text[:max_chars]
        return text
    except Exception:
        return ""


def _ocr_enabled() -> bool:
    v = os.getenv("RESUME_OCR", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _extract_ocr(data: bytes, max_chars: int) -> str:
    """Optional OCR for scanned PDFs. Requires: tesseract, poppler, pdf2image, pytesseract, Pillow."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ImportError:
        return ""
    try:
        images = convert_from_bytes(
            data,
            dpi=200,
            first_page=1,
            last_page=OCR_MAX_PAGES,
        )
        parts: list[str] = []
        for im in images:
            parts.append(pytesseract.image_to_string(im))
        text = "\n".join(parts).strip()
        if len(text) > max_chars:
            return text[:max_chars]
        return text
    except Exception:
        return ""


def extract_text_from_pdf(data: bytes, max_chars: int = 100_000) -> str:
    """
    Extract text: pypdf → if short, PyMuPDF → if still short and RESUME_OCR=1, Tesseract OCR (first pages).
    """
    text = _extract_pypdf(data, max_chars)
    if len(text.strip()) >= MIN_TEXT_CHARS:
        return text

    alt = _extract_pymupdf(data, max_chars)
    if len(alt.strip()) > len(text.strip()):
        text = alt

    if len(text.strip()) >= MIN_TEXT_CHARS:
        return text

    if _ocr_enabled():
        ocr_text = _extract_ocr(data, max_chars)
        if len(ocr_text.strip()) > len(text.strip()):
            text = ocr_text

    return text


def _looks_like_filename_or_title(line: str) -> bool:
    """Reject PDF titles / file-like strings mistaken for a person's name."""
    low = line.lower().strip()
    if ".pdf" in low or ".doc" in low or ".docx" in low or ".rtf" in low:
        return True
    if low.endswith(" resume") or low in ("resume", "cv", "curriculum vitae", "cover letter"):
        return True
    if line.count("_") >= 2:
        return True
    if re.fullmatch(r"[\w\-_.]+\.(pdf|doc|docx)", low):
        return True
    return False


def infer_candidate_name_from_text(text: str) -> str | None:
    """Heuristic candidate-name guess from extracted resume text (never use PDF filename)."""
    if not text:
        return None
    word_re = re.compile(
        r"^(?:(?:[A-Za-z\u00C0-\u024F]|[\u0400-\u04FF])(?:[A-Za-z\u00C0-\u024F'`.-]|[\u0400-\u04FF])*)$"
    )
    for raw in text.splitlines()[:25]:
        line = re.sub(r"\s+", " ", raw).strip(" ,.-:|")
        if not line or _looks_like_filename_or_title(line):
            continue
        lower = line.lower()
        if "resume" in lower or "curriculum vitae" in lower:
            continue
        if "@" in line or "http://" in lower or "https://" in lower or "linkedin" in lower:
            continue
        if any(ch.isdigit() for ch in line):
            continue
        parts = [p for p in line.split(" ") if p]
        if len(parts) < 2 or len(parts) > 5:
            continue
        if not all(word_re.fullmatch(p) for p in parts):
            continue
        return " ".join(parts)
    return None
