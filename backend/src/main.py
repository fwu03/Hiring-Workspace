"""
FastAPI backend for the hiring workspace.
Run from the backend/ directory: uvicorn src.main:app --reload --port 8000
"""
from __future__ import annotations

import hashlib
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import database.models  # noqa: F401 — register ORM tables
from database.connection import Base, engine
from database.migrations import apply_sqlite_migrations

from database.models import User

from .auth_deps import require_writer_user
from .auth_routes import router as auth_router
from . import crud, schemas
from .hiring_routes import router as hiring_router
from .resume_files import ensure_upload_dir

_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    apply_sqlite_migrations(engine)
    ensure_upload_dir()
    yield


app = FastAPI(title="Hiring Workspace API", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(hiring_router)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_cors = os.getenv("CORS_ORIGINS", "").strip()
origins = [o.strip() for o in _cors.split(",") if o.strip()] if _cors else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCORE_SYSTEM = """You are an expert technical recruiter. Score how well the candidate matches the hiring criteria.
Respond with a single JSON object only, no markdown, in this exact shape:
{"score": <integer from 0 to 100>, "rationale": "<one or two short sentences>"}"""

# Separate task from scoring: structured field extraction from unstructured resume text (requires LLM).
EXTRACT_SYSTEM = """You extract structured fields from resume or CV plain text. Return JSON only, no markdown, exactly:
{"name": <string or null>, "yearsOfExperience": <non-negative integer or null>, "school": <string or null>, "degree": <string or null>}

NAME (highest priority — read carefully):
- Extract the candidate's real human name as written on the resume (usually 2–4 words near the top: contact/header area).
- Use the name the person uses professionally (Latin script if both native and English appear).
- NEVER use: PDF filename, file path, document title, "Resume", "CV", company names alone, or email local-part as the name.
- If the top line is a job title, scan the next lines for the person's name before contact details.
- If you cannot find a plausible full name, set name to null.

Other rules:
- yearsOfExperience = total relevant professional work years (estimate if ranges given; null if impossible).
- school = primary university/college for the highest completed or in-progress degree mentioned (one string).
- degree = short label e.g. "PhD CS", "MS Statistics", "BS Computer Science".
Use null for any field you cannot determine confidently."""


class ScoreResumeRequest(BaseModel):
    candidateName: str = Field(..., min_length=1)
    batchPrompt: str = Field(default="")
    resumeText: str = Field(default="")


class ScoreResumeResponse(BaseModel):
    score: int
    rationale: Optional[str] = None


class ExtractResumeRequest(BaseModel):
    resumeText: str = Field(default="")
    candidateNameHint: Optional[str] = Field(
        default=None, description="Optional hint if filename or form had a name"
    )


class ExtractResumeResponse(BaseModel):
    name: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    school: Optional[str] = None
    degree: Optional[str] = None


def _build_user_message(body: ScoreResumeRequest) -> str:
    text = body.resumeText[:24_000]
    return f"""Hiring criteria and instructions:
{body.batchPrompt}

Candidate name: {body.candidateName}

Resume:
{text}"""


def _mock_score(body: ScoreResumeRequest) -> ScoreResumeResponse:
    blob = f"{body.batchPrompt}\n{body.resumeText}\n{body.candidateName}"
    h = int(hashlib.sha256(blob.encode()).hexdigest()[:8], 16)
    score = 55 + (h % 41)
    return ScoreResumeResponse(
        score=score,
        rationale="Mock score from Python API (set OPENAI_* or AZURE_OPENAI_* in backend/.env for live LLM).",
    )


def _parse_score_json(content: str) -> ScoreResumeResponse:
    trimmed = content.strip()
    try:
        data = json.loads(trimmed)
        score = int(data["score"])
        score = max(0, min(100, score))
        rat = data.get("rationale")
        return ScoreResumeResponse(score=score, rationale=rat if isinstance(rat, str) else None)
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        import re

        m = re.search(r'"score"\s*:\s*(\d+)', trimmed)
        if m:
            return ScoreResumeResponse(score=max(0, min(100, int(m.group(1)))))
    raise ValueError("Could not parse model response as JSON with a score")


def _build_extract_user_message(body: ExtractResumeRequest) -> str:
    text = body.resumeText[:24_000]
    hint = body.candidateNameHint or ""
    extra = f"\nHint (name from upload form, may be empty): {hint}\n" if hint.strip() else "\n"
    return f"Resume text:{extra}{text}"


def _mock_extract(body: ExtractResumeRequest) -> ExtractResumeResponse:
    blob = body.resumeText or "empty"
    h = int(hashlib.sha256(blob.encode()).hexdigest()[:8], 16)
    yoe = 2 + (h % 12)
    return ExtractResumeResponse(
        name=None,
        yearsOfExperience=yoe,
        school="Example University (mock — set OPENAI_* or AZURE_OPENAI_* in backend/.env for LLM extraction)",
        degree="BS Computer Science (mock)",
    )


def _parse_extract_json(content: str) -> ExtractResumeResponse:
    trimmed = content.strip()
    try:
        data = json.loads(trimmed)
        yoe = data.get("yearsOfExperience")
        if yoe is not None:
            yoe = int(yoe)
            yoe = max(0, yoe)
        return ExtractResumeResponse(
            name=data.get("name") if isinstance(data.get("name"), str) else None,
            yearsOfExperience=yoe,
            school=data.get("school") if isinstance(data.get("school"), str) else None,
            degree=data.get("degree") if isinstance(data.get("degree"), str) else None,
        )
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    raise ValueError("Could not parse extraction JSON")


def _openai_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def _azure_configured() -> bool:
    return bool(
        os.getenv("AZURE_OPENAI_ENDPOINT", "").strip()
        and os.getenv("AZURE_OPENAI_API_KEY", "").strip()
        and os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip()
    )


def _llm_configured() -> bool:
    return _openai_configured() or _azure_configured()


def _llm_provider_preference() -> str:
    """How to choose between OpenAI and Azure when both might be configured.

    - ``auto`` (default): use OpenAI if ``OPENAI_API_KEY`` is set, else Azure if configured.
    - ``openai``: use OpenAI platform API only.
    - ``azure``: use Azure OpenAI only (so you can keep OPENAI_API_KEY unset or use Azure while testing).
    """
    raw = (os.getenv("LLM_PROVIDER") or "auto").strip().lower().replace("-", "_")
    if raw in ("azure", "azure_openai"):
        return "azure"
    if raw in ("openai", "openai_platform"):
        return "openai"
    return "auto"


def _health_llm_label() -> str:
    if not _llm_configured():
        return "mock"
    pref = _llm_provider_preference()
    if pref == "azure":
        return "azure-openai" if _azure_configured() else "unconfigured(azure_requested)"
    if pref == "openai":
        return "openai" if _openai_configured() else "unconfigured(openai_requested)"
    if _openai_configured():
        return "openai"
    return "azure-openai"


async def _openai_chat(
    messages: List[Dict[str, str]],
    use_json_object: bool,
    *,
    max_tokens: int = 500,
) -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    model = (os.getenv("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY missing")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }
    if use_json_object:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code == 400 and use_json_object:
            payload.pop("response_format", None)
            r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        err = data.get("error")
        if isinstance(err, dict) and err.get("message"):
            raise RuntimeError(str(err["message"]))
        choices = data.get("choices") or []
        content = (choices[0].get("message") or {}).get("content")
        if not content:
            raise RuntimeError("Empty response from OpenAI")
        return content


async def _llm_chat(
    messages: List[Dict[str, str]],
    use_json_object: bool,
    *,
    max_tokens: int = 500,
) -> str:
    pref = _llm_provider_preference()
    if pref == "azure":
        if _azure_configured():
            return await _azure_chat(messages, use_json_object, max_tokens=max_tokens)
        raise RuntimeError(
            "LLM_PROVIDER=azure but Azure OpenAI is not fully configured "
            "(set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT)."
        )
    if pref == "openai":
        if _openai_configured():
            return await _openai_chat(messages, use_json_object, max_tokens=max_tokens)
        raise RuntimeError("LLM_PROVIDER=openai but OPENAI_API_KEY is not set.")
    if _openai_configured():
        return await _openai_chat(messages, use_json_object, max_tokens=max_tokens)
    if _azure_configured():
        return await _azure_chat(messages, use_json_object, max_tokens=max_tokens)
    raise RuntimeError("No LLM backend available")


async def _azure_chat(
    messages: List[Dict[str, str]],
    use_json_object: bool,
    *,
    max_tokens: int = 500,
) -> str:
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    key = os.getenv("AZURE_OPENAI_API_KEY", "")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    if not (endpoint and key and deployment):
        raise RuntimeError("Azure env vars incomplete")

    url = f"{endpoint}/openai/deployments/{deployment}/chat/completions"
    params = {"api-version": api_version}
    headers = {"api-key": key, "Content-Type": "application/json"}
    payload: Dict[str, Any] = {
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }
    if use_json_object:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(url, params=params, headers=headers, json=payload)
        if r.status_code == 400 and use_json_object:
            payload.pop("response_format", None)
            r = await client.post(url, params=params, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        if err := data.get("error", {}).get("message"):
            raise RuntimeError(err)
        choices = data.get("choices") or []
        content = (choices[0].get("message") or {}).get("content")
        if not content:
            raise RuntimeError("Empty response from Azure OpenAI")
        return content


def _maybe_apply_heuristic_name(db, candidate_id: str) -> None:
    """If name is still a placeholder, infer from resume text (no LLM required)."""
    from .pdf_text import infer_candidate_name_from_text

    c = crud.get_candidate_row(db, candidate_id)
    if not c or not (c.resume_text or "").strip():
        return
    nm = (c.name or "").strip()
    if nm and nm not in ("Candidate", "Unnamed candidate"):
        return
    inferred = infer_candidate_name_from_text(c.resume_text)
    if inferred:
        crud.patch_candidate(db, candidate_id, schemas.CandidatePatch(name=inferred))


async def maybe_enrich_candidate_after_pdf_upload(db, candidate_id: str) -> None:
    """Fill YoE / school / degree / name from resume text after PDF upload (LLM when configured, then heuristic fallback)."""
    import logging

    c = crud.get_candidate_row(db, candidate_id)
    if not c or not (c.resume_text or "").strip():
        return
    if _llm_configured():
        try:
            body = ExtractResumeRequest(resumeText=c.resume_text, candidateNameHint=c.name)
            messages = [
                {"role": "system", "content": EXTRACT_SYSTEM},
                {"role": "user", "content": _build_extract_user_message(body)},
            ]
            raw = await _llm_chat(messages, True, max_tokens=1024)
            ex = _parse_extract_json(raw)
            updates: Dict[str, Any] = {}
            if ex.name and str(ex.name).strip():
                updates["name"] = str(ex.name).strip()
            if ex.yearsOfExperience is not None:
                updates["yearsOfExperience"] = ex.yearsOfExperience
            if ex.school and str(ex.school).strip():
                updates["school"] = str(ex.school).strip()
            if ex.degree and str(ex.degree).strip():
                updates["degree"] = str(ex.degree).strip()
            if updates:
                crud.patch_candidate(db, candidate_id, schemas.CandidatePatch(**updates))
        except Exception as exc:
            logging.getLogger(__name__).warning("Post-upload resume LLM extraction failed: %s", exc)
    _maybe_apply_heuristic_name(db, candidate_id)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "llm": _health_llm_label()}


@app.post("/api/v1/score-resume", response_model=ScoreResumeResponse)
async def score_resume(
    body: ScoreResumeRequest,
    _writer: User = Depends(require_writer_user),
) -> ScoreResumeResponse:
    prompt = body.batchPrompt.strip() or "Evaluate this candidate for the role."
    body = body.model_copy(update={"batchPrompt": prompt})

    if not _llm_configured():
        return _mock_score(body)

    messages = [
        {"role": "system", "content": SCORE_SYSTEM},
        {"role": "user", "content": _build_user_message(body)},
    ]
    try:
        raw = await _llm_chat(messages, use_json_object=True)
        return _parse_score_json(raw)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLM HTTP {e.response.status_code}: {e.response.text[:500]}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/api/v1/extract-resume", response_model=ExtractResumeResponse)
async def extract_resume(
    body: ExtractResumeRequest,
    _writer: User = Depends(require_writer_user),
) -> ExtractResumeResponse:
    """LLM-based extraction of name, YoE, school, degree from raw resume text (separate from scoring)."""
    if not (body.resumeText or "").strip():
        raise HTTPException(status_code=400, detail="resumeText is required")

    if not _llm_configured():
        return _mock_extract(body)

    messages = [
        {"role": "system", "content": EXTRACT_SYSTEM},
        {"role": "user", "content": _build_extract_user_message(body)},
    ]
    try:
        raw = await _llm_chat(messages, True, max_tokens=1024)
        return _parse_extract_json(raw)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLM HTTP {e.response.status_code}: {e.response.text[:500]}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
