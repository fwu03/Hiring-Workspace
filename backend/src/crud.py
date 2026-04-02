"""CRUD for hiring batches and candidates."""
from __future__ import annotations

import json
import uuid
from datetime import date
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

import database.models as models

from . import schemas


def _flags_default() -> dict:
    return {
        "seenBefore": False,
        "interviewedBefore": False,
        "otherBatch": False,
    }


def _candidate_to_out(c: models.Candidate) -> schemas.CandidateOut:
    try:
        flags = json.loads(c.flags_json or "{}")
    except json.JSONDecodeError:
        flags = _flags_default()
    if not isinstance(flags, dict):
        flags = _flags_default()
    try:
        history_raw = json.loads(c.history_json or "[]")
    except json.JSONDecodeError:
        history_raw = []
    history: List[schemas.ApplicationHistoryEntryOut] = []
    if isinstance(history_raw, list):
        for h in history_raw:
            if not isinstance(h, dict):
                continue
            history.append(
                schemas.ApplicationHistoryEntryOut(
                    batchTag=str(h.get("batchTag", "")),
                    date=str(h.get("date", "")),
                    status=str(h.get("status", "")),
                    outcome=str(h.get("outcome", "")),
                )
            )
    try:
        rounds_raw = json.loads(c.interview_rounds_json or "[]")
    except json.JSONDecodeError:
        rounds_raw = []
    interview_rounds: List[schemas.CandidateInterviewRoundOut] = []
    if isinstance(rounds_raw, list):
        for r in rounds_raw:
            if not isinstance(r, dict):
                continue
            rating = r.get("rating")
            rnum: Optional[float] = None
            if rating is not None:
                try:
                    rnum = float(rating)
                except (TypeError, ValueError):
                    rnum = None
            interview_rounds.append(
                schemas.CandidateInterviewRoundOut(
                    id=str(r.get("id", "")),
                    roundName=str(r.get("roundName", "")),
                    interviewer=str(r.get("interviewer", "")),
                    date=str(r.get("date", "")),
                    notes=str(r.get("notes", "")),
                    rating=rnum,
                )
            )
    workspace = None
    if c.interview_workspace_json:
        try:
            w = json.loads(c.interview_workspace_json)
            workspace = w if isinstance(w, dict) else None
        except json.JSONDecodeError:
            workspace = None

    return schemas.CandidateOut(
        id=c.id,
        batchId=c.batch_id,
        name=c.name,
        email=c.email,
        phone=c.phone or "",
        yearsOfExperience=c.years_of_experience,
        school=c.school or "",
        degree=c.degree or "",
        flags=flags,
        llmScore=float(c.llm_score) if c.llm_score is not None else None,
        llmRationale=c.llm_rationale,
        status=c.status,
        hmComment=c.hm_comment,
        resumeText=c.resume_text or "",
        history=history,
        interviewRounds=interview_rounds,
        interviewWorkspace=workspace,
        hasResumePdf=bool(getattr(c, "resume_pdf_present", False)),
    )


def _batch_counts(db: Session, batch_id: str) -> tuple[int, int]:
    total = db.query(func.count(models.Candidate.id)).filter(models.Candidate.batch_id == batch_id).scalar()
    total = int(total or 0)
    shortlisted = (
        db.query(func.count(models.Candidate.id))
        .filter(
            models.Candidate.batch_id == batch_id,
            models.Candidate.status == "shortlisted",
        )
        .scalar()
    )
    shortlisted = int(shortlisted or 0)
    return total, shortlisted


def batch_to_out(db: Session, b: models.Batch) -> schemas.BatchOut:
    cand_count, short_count = _batch_counts(db, b.id)
    return schemas.BatchOut(
        id=b.id,
        tag=b.tag,
        createdDate=b.created_date,
        candidateCount=cand_count,
        shortlistedCount=short_count,
        status=b.status,
        uploadComplete=b.upload_complete,
        llmPrompt=b.llm_prompt,
    )


def list_batches(db: Session) -> List[schemas.BatchOut]:
    rows = (
        db.query(models.Batch)
        .filter(models.Batch.deleted_at.is_(None))
        .order_by(models.Batch.created_date.desc())
        .all()
    )
    return [batch_to_out(db, b) for b in rows]


def get_batch_row(db: Session, batch_id: str) -> Optional[models.Batch]:
    return (
        db.query(models.Batch)
        .filter(models.Batch.id == batch_id, models.Batch.deleted_at.is_(None))
        .first()
    )


def get_batch_detail(db: Session, batch_id: str) -> Optional[schemas.BatchDetailOut]:
    b = get_batch_row(db, batch_id)
    if not b:
        return None
    cands = (
        db.query(models.Candidate)
        .filter(models.Candidate.batch_id == batch_id)
        .order_by(models.Candidate.name)
        .all()
    )
    return schemas.BatchDetailOut(
        batch=batch_to_out(db, b),
        candidates=[_candidate_to_out(c) for c in cands],
    )


def create_batch(db: Session, body: schemas.BatchCreate) -> schemas.BatchOut:
    bid = str(uuid.uuid4())
    today = date.today().isoformat()
    row = models.Batch(
        id=bid,
        tag=body.tag,
        created_date=today,
        status=body.status,
        upload_complete=body.uploadComplete,
        llm_prompt=body.llmPrompt,
        deleted_at=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return batch_to_out(db, row)


def patch_batch(db: Session, batch_id: str, body: schemas.BatchPatch) -> Optional[schemas.BatchOut]:
    b = get_batch_row(db, batch_id)
    if not b:
        return None
    data = body.model_dump(exclude_unset=True)
    if "tag" in data:
        b.tag = data["tag"]
    if "llmPrompt" in data:
        b.llm_prompt = data["llmPrompt"]
    if "status" in data and data["status"] is not None:
        b.status = data["status"]
    if "uploadComplete" in data and data["uploadComplete"] is not None:
        b.upload_complete = data["uploadComplete"]
    db.commit()
    db.refresh(b)
    return batch_to_out(db, b)


def soft_delete_batch(db: Session, batch_id: str) -> bool:
    b = (
        db.query(models.Batch)
        .filter(models.Batch.id == batch_id, models.Batch.deleted_at.is_(None))
        .first()
    )
    if not b:
        return False
    b.deleted_at = date.today().isoformat()
    db.commit()
    return True


def get_candidate_row(db: Session, candidate_id: str) -> Optional[models.Candidate]:
    return db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()


def get_candidate(db: Session, candidate_id: str) -> Optional[schemas.CandidateOut]:
    c = get_candidate_row(db, candidate_id)
    if not c:
        return None
    b = get_batch_row(db, c.batch_id)
    if not b:
        return None
    return _candidate_to_out(c)


def create_candidate(db: Session, batch_id: str, body: schemas.CandidateCreate) -> Optional[schemas.CandidateOut]:
    if not get_batch_row(db, batch_id):
        return None
    cid = str(uuid.uuid4())
    flags = body.flags.model_dump() if body.flags else _flags_default()
    history = [h.model_dump() for h in (body.history or [])]
    rounds = [r.model_dump() for r in (body.interviewRounds or [])]
    row = models.Candidate(
        id=cid,
        batch_id=batch_id,
        name=body.name,
        email=body.email or "",
        phone=body.phone or "",
        years_of_experience=body.yearsOfExperience,
        school=body.school or "",
        degree=body.degree or "",
        flags_json=json.dumps(flags),
        llm_score=None,
        status="new",
        hm_comment=None,
        resume_text=body.resumeText or "",
        history_json=json.dumps(history),
        interview_rounds_json=json.dumps(rounds),
        interview_workspace_json=None,
        resume_pdf_present=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _candidate_to_out(row)


def save_resume_pdf(db: Session, candidate_id: str, data: bytes) -> Optional[schemas.CandidateOut]:
    """Write PDF bytes to disk, extract resume text (pypdf / PyMuPDF / optional OCR). Name from LLM or fallback after upload."""
    from .pdf_text import extract_text_from_pdf
    from .resume_files import write_pdf

    c = get_candidate_row(db, candidate_id)
    if not c:
        return None
    if not get_batch_row(db, c.batch_id):
        return None
    write_pdf(candidate_id, data)
    c.resume_pdf_present = True
    extracted = extract_text_from_pdf(data)
    if extracted:
        c.resume_text = extracted
    db.commit()
    db.refresh(c)
    return _candidate_to_out(c)


def patch_candidate(db: Session, candidate_id: str, body: schemas.CandidatePatch) -> Optional[schemas.CandidateOut]:
    c = get_candidate_row(db, candidate_id)
    if not c:
        return None
    if not get_batch_row(db, c.batch_id):
        return None
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        c.name = data["name"]
    if "email" in data:
        c.email = data["email"]
    if "phone" in data:
        c.phone = data["phone"]
    if "yearsOfExperience" in data and data["yearsOfExperience"] is not None:
        c.years_of_experience = data["yearsOfExperience"]
    if "school" in data:
        c.school = data["school"]
    if "degree" in data:
        c.degree = data["degree"]
    if "flags" in data and data["flags"] is not None:
        try:
            cur = json.loads(c.flags_json or "{}")
        except json.JSONDecodeError:
            cur = _flags_default()
        if not isinstance(cur, dict):
            cur = _flags_default()
        merged = {**cur, **data["flags"]}
        c.flags_json = json.dumps(merged)
    if "llmScore" in data:
        v = data["llmScore"]
        c.llm_score = None if v is None else float(v)
    if "llmRationale" in data:
        v = data["llmRationale"]
        c.llm_rationale = None if v is None else str(v)
    if "status" in data and data["status"] is not None:
        c.status = data["status"]
    if "hmComment" in data:
        c.hm_comment = data["hmComment"]
    if "resumeText" in data:
        c.resume_text = data["resumeText"]
    if "history" in data and data["history"] is not None:
        c.history_json = json.dumps([h.model_dump() for h in data["history"]])
    if "interviewRounds" in data and data["interviewRounds"] is not None:
        c.interview_rounds_json = json.dumps([r.model_dump() for r in data["interviewRounds"]])
    if "interviewWorkspace" in data:
        if data["interviewWorkspace"] is None:
            c.interview_workspace_json = None
        else:
            c.interview_workspace_json = json.dumps(data["interviewWorkspace"])
    db.commit()
    db.refresh(c)
    return _candidate_to_out(c)
