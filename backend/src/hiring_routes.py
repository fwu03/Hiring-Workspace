"""REST API for hiring batches and candidates — all durable state is in the database."""
from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import database.models as orm
from database.connection import get_db

from . import crud, schemas
from .auth_deps import canonical_role, get_current_user, require_writer_user
from .interview_workspace_merge import merge_interview_workspace_for_interviewer
from .resume_files import MAX_BYTES, is_valid_pdf_header, path_for

router = APIRouter(prefix="/api/v1", tags=["hiring"])


@router.get("/batches", response_model=List[schemas.BatchOut])
def api_list_batches(
    db: Session = Depends(get_db),
    _user: orm.User = Depends(get_current_user),
) -> List[schemas.BatchOut]:
    return crud.list_batches(db)


@router.post("/batches", response_model=schemas.BatchOut)
def api_create_batch(
    body: schemas.BatchCreate,
    db: Session = Depends(get_db),
    _writer: orm.User = Depends(require_writer_user),
) -> schemas.BatchOut:
    return crud.create_batch(db, body)


@router.get("/batches/{batch_id}", response_model=schemas.BatchDetailOut)
def api_get_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _user: orm.User = Depends(get_current_user),
) -> schemas.BatchDetailOut:
    detail = crud.get_batch_detail(db, batch_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Batch not found")
    return detail


@router.patch("/batches/{batch_id}", response_model=schemas.BatchOut)
def api_patch_batch(
    batch_id: str,
    body: schemas.BatchPatch,
    db: Session = Depends(get_db),
    _writer: orm.User = Depends(require_writer_user),
) -> schemas.BatchOut:
    out = crud.patch_batch(db, batch_id, body)
    if not out:
        raise HTTPException(status_code=404, detail="Batch not found")
    return out


@router.delete("/batches/{batch_id}")
def api_delete_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _writer: orm.User = Depends(require_writer_user),
) -> Dict[str, bool]:
    ok = crud.soft_delete_batch(db, batch_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"ok": True}


@router.post("/batches/{batch_id}/candidates", response_model=schemas.CandidateOut)
def api_create_candidate(
    batch_id: str,
    body: schemas.CandidateCreate,
    db: Session = Depends(get_db),
    _writer: orm.User = Depends(require_writer_user),
) -> schemas.CandidateOut:
    out = crud.create_candidate(db, batch_id, body)
    if not out:
        raise HTTPException(status_code=404, detail="Batch not found")
    return out


@router.get("/candidates/{candidate_id}", response_model=schemas.CandidateOut)
def api_get_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _user: orm.User = Depends(get_current_user),
) -> schemas.CandidateOut:
    out = crud.get_candidate(db, candidate_id)
    if not out:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return out


@router.post("/candidates/{candidate_id}/resume", response_model=schemas.CandidateOut)
async def api_upload_resume_pdf(
    candidate_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _writer: orm.User = Depends(require_writer_user),
) -> schemas.CandidateOut:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file (.pdf)")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="PDF too large (max 15MB)")
    if not is_valid_pdf_header(data):
        raise HTTPException(status_code=400, detail="File is not a valid PDF")
    out = crud.save_resume_pdf(db, candidate_id, data)
    if not out:
        raise HTTPException(status_code=404, detail="Candidate not found")
    from . import main as main_module

    await main_module.maybe_enrich_candidate_after_pdf_upload(db, candidate_id)
    refreshed = crud.get_candidate(db, candidate_id)
    return refreshed or out


@router.get("/candidates/{candidate_id}/resume")
def api_get_resume_pdf(candidate_id: str, db: Session = Depends(get_db)) -> FileResponse:
    c = crud.get_candidate_row(db, candidate_id)
    if not c or not c.resume_pdf_present:
        raise HTTPException(status_code=404, detail="No resume PDF for this candidate")
    pdf_path = path_for(candidate_id)
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Resume file missing on disk")
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"resume-{candidate_id}.pdf",
        headers={"Content-Disposition": 'inline; filename="resume.pdf"'},
    )


@router.patch("/candidates/{candidate_id}", response_model=schemas.CandidateOut)
def api_patch_candidate(
    candidate_id: str,
    body: schemas.CandidatePatch,
    db: Session = Depends(get_db),
    user: orm.User = Depends(get_current_user),
) -> schemas.CandidateOut:
    c = crud.get_candidate_row(db, candidate_id)
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")

    body_effective = body

    # Interviewers: scoped interview workspace merge + shortlist (New → Shortlisted only). Hiring managers: full edit.
    if canonical_role(user.role) != "hiring_manager":
        data = body.model_dump(exclude_unset=True)
        allowed = {"interviewWorkspace", "interviewRounds", "status"}
        attempted = set(data.keys())
        if not attempted.issubset(allowed):
            raise HTTPException(
                status_code=403,
                detail="Interviewers can only update interview feedback or add candidates to the shortlist.",
            )
        if "interviewWorkspace" in data:
            if data["interviewWorkspace"] is None:
                raise HTTPException(
                    status_code=403,
                    detail="Only hiring managers can clear the interview workspace.",
                )
            display = ((user.name or "").strip() or (user.email or "").strip())
            merged = merge_interview_workspace_for_interviewer(
                c.interview_workspace_json,
                data["interviewWorkspace"],
                str(user.id),
                display,
            )
            body_effective = body.model_copy(update={"interviewWorkspace": merged})
        if "status" in data:
            new_status = data["status"]
            if new_status != "shortlisted":
                raise HTTPException(
                    status_code=403,
                    detail="Interviewers may only move candidates from New to Shortlisted.",
                )
            if c.status != "new":
                raise HTTPException(
                    status_code=403,
                    detail="Only candidates in New status can be added to the shortlist by interviewers.",
                )

    out = crud.patch_candidate(db, candidate_id, body_effective)
    if not out:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return out
