"""FastAPI dependencies: JWT bearer and role checks."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

import database.models as models
from database.connection import get_db

from .auth_crud import get_user_by_id
from .auth_security import decode_access_token

security = HTTPBearer(auto_error=False)


def canonical_role(role: str) -> str:
    """Map legacy roles to the new two-role model."""
    if role in ("hiring_manager", "admin", "recruiter"):
        return "hiring_manager"
    return "interviewer"


def get_current_user_optional(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[models.User]:
    if not creds or not creds.credentials:
        return None
    try:
        payload = decode_access_token(creds.credentials)
        uid = payload.get("sub")
        if not uid or not isinstance(uid, str):
            return None
    except Exception:
        return None
    return get_user_by_id(db, uid)


def get_current_user(
    user: Annotated[Optional[models.User], Depends(get_current_user_optional)],
) -> models.User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_writer_user(
    user: Annotated[models.User, Depends(get_current_user)],
) -> models.User:
    if canonical_role(user.role) != "hiring_manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return user


def require_admin_user(
    user: Annotated[models.User, Depends(get_current_user)],
) -> models.User:
    if canonical_role(user.role) != "hiring_manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hiring manager only")
    return user
