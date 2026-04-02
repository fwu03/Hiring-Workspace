"""Pydantic schemas — API uses camelCase field names to match the frontend."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class BatchCreate(BaseModel):
    tag: str = Field(..., min_length=1)
    llmPrompt: Optional[str] = None
    status: str = "pending"
    uploadComplete: bool = True


class BatchPatch(BaseModel):
    tag: Optional[str] = None
    llmPrompt: Optional[str] = None
    status: Optional[str] = None
    uploadComplete: Optional[bool] = None


class BatchOut(BaseModel):
    id: str
    tag: str
    createdDate: str
    candidateCount: int
    shortlistedCount: int
    status: str
    uploadComplete: bool
    llmPrompt: Optional[str] = None


class CandidateFlags(BaseModel):
    seenBefore: bool = False
    interviewedBefore: bool = False
    otherBatch: bool = False
    otherBatchInfo: Optional[str] = None


class ApplicationHistoryEntryOut(BaseModel):
    batchTag: str
    date: str
    status: str
    outcome: str


class CandidateInterviewRoundOut(BaseModel):
    id: str
    roundName: str
    interviewer: str
    date: str
    notes: str
    rating: Optional[float] = None


class CandidateOut(BaseModel):
    id: str
    batchId: str
    name: str
    email: str
    phone: str
    yearsOfExperience: int
    school: str
    degree: str
    flags: Dict[str, Any]
    llmScore: Optional[float] = None
    llmRationale: Optional[str] = None
    status: str
    hmComment: Optional[str] = None
    resumeText: str
    history: List[ApplicationHistoryEntryOut]
    interviewRounds: List[CandidateInterviewRoundOut]
    interviewWorkspace: Optional[Dict[str, Any]] = None
    hasResumePdf: bool = False


class BatchDetailOut(BaseModel):
    batch: BatchOut
    candidates: List[CandidateOut]


class CandidateCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = ""
    phone: str = ""
    yearsOfExperience: int = 0
    school: str = ""
    degree: str = ""
    flags: Optional[CandidateFlags] = None
    resumeText: str = ""
    history: Optional[List[ApplicationHistoryEntryOut]] = None
    interviewRounds: Optional[List[CandidateInterviewRoundOut]] = None


class CandidatePatch(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    school: Optional[str] = None
    degree: Optional[str] = None
    flags: Optional[Dict[str, Any]] = None
    llmScore: Optional[float] = None
    llmRationale: Optional[str] = None
    status: Optional[str] = None
    hmComment: Optional[str] = None
    resumeText: Optional[str] = None
    history: Optional[List[ApplicationHistoryEntryOut]] = None
    interviewRounds: Optional[List[CandidateInterviewRoundOut]] = None
    interviewWorkspace: Optional[Dict[str, Any]] = None
