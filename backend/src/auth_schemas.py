"""Pydantic models for auth API."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

RoleLiteral = Literal["hiring_manager", "interviewer"]


class LoginRequest(BaseModel):
    """Sign in with the same display name and email recorded for the account."""
    name: str = Field(..., min_length=1, max_length=256)
    email: str = Field(..., min_length=3)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1, max_length=256)
    role: RoleLiteral = "interviewer"


class UserPatch(BaseModel):
    """Hiring manager updates: role and/or display name."""

    role: Optional[RoleLiteral] = None
    name: Optional[str] = Field(None, min_length=1, max_length=256)
