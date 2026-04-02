"""Auth: login, register, user list / role updates."""
from __future__ import annotations

import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import database.models as models
from database.connection import get_db

from . import auth_schemas
from .auth_crud import count_users, create_user, get_user_by_email, list_users, patch_user
from .auth_deps import canonical_role, get_current_user, get_current_user_optional, require_admin_user
from .auth_names import names_match
from .auth_security import create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _public_signup_enabled() -> bool:
    return os.getenv("ALLOW_PUBLIC_SIGNUP", "").strip().lower() in ("1", "true", "yes", "on")


@router.get("/status")
def auth_status(db: Session = Depends(get_db)) -> dict:
    """Public: bootstrap and optional open sign-up."""
    return {
        "requiresRegistration": count_users(db) == 0,
        "publicSignupEnabled": _public_signup_enabled(),
    }


def _user_out(u: models.User) -> auth_schemas.UserOut:
    return auth_schemas.UserOut(
        id=u.id,
        email=u.email,
        name=u.name or "",
        role=canonical_role(u.role),
    )


@router.post("/login", response_model=auth_schemas.TokenResponse)
def login(body: auth_schemas.LoginRequest, db: Session = Depends(get_db)) -> auth_schemas.TokenResponse:
    u = get_user_by_email(db, str(body.email))
    if not u or not names_match(u.name, body.name):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid name or email")
    token = create_access_token(user_id=u.id, email=u.email, role=canonical_role(u.role))
    return auth_schemas.TokenResponse(access_token=token, user=_user_out(u))


@router.get("/me", response_model=auth_schemas.UserOut)
def auth_me(user: models.User = Depends(get_current_user)) -> auth_schemas.UserOut:
    return _user_out(user)


@router.post("/register", response_model=auth_schemas.UserOut)
def register(
    body: auth_schemas.RegisterRequest,
    db: Session = Depends(get_db),
    current: Optional[models.User] = Depends(get_current_user_optional),
) -> auth_schemas.UserOut:
    if count_users(db) == 0:
        if body.role != "hiring_manager":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The first account must have role 'hiring_manager'.",
            )
        u = create_user(db, str(body.email), body.name, "hiring_manager")
        return _user_out(u)
    if current and canonical_role(current.role) == "hiring_manager":
        if get_user_by_email(db, str(body.email)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
        u = create_user(db, str(body.email), body.name, body.role)
        return _user_out(u)
    if _public_signup_enabled() and body.role in ("hiring_manager", "interviewer"):
        if get_user_by_email(db, str(body.email)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
        u = create_user(db, str(body.email), body.name, body.role)
        return _user_out(u)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only hiring managers can create users, or enable ALLOW_PUBLIC_SIGNUP for self-service.",
    )


@router.get("/users", response_model=List[auth_schemas.UserOut])
def auth_list_users(
    _admin: models.User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> List[auth_schemas.UserOut]:
    return [_user_out(u) for u in list_users(db)]


@router.patch("/users/{user_id}", response_model=auth_schemas.UserOut)
def auth_patch_user(
    user_id: str,
    body: auth_schemas.UserPatch,
    admin: models.User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> auth_schemas.UserOut:
    if body.role is None and body.name is None:
        raise HTTPException(status_code=400, detail="Provide at least one of role or name.")
    if user_id == admin.id and body.role is not None and body.role != "hiring_manager":
        raise HTTPException(status_code=400, detail="You cannot remove your own hiring manager role.")
    try:
        u = patch_user(db, user_id, role=body.role, name=body.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_out(u)
