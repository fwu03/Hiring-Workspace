"""User persistence."""
from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

import database.models as models

from .auth_security import hash_password

VALID_ROLES = frozenset({"hiring_manager", "interviewer"})

# Passwords are not used; hash is a stable placeholder for the NOT NULL column.
_passwordless_hash_cache: Optional[str] = None


def _passwordless_placeholder_hash() -> str:
    global _passwordless_hash_cache
    if _passwordless_hash_cache is None:
        _passwordless_hash_cache = hash_password("__passwordless_account_v1__")
    assert _passwordless_hash_cache is not None
    return _passwordless_hash_cache


def count_users(db: Session) -> int:
    return int(db.query(models.User).count())


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    e = email.strip().lower()
    return db.query(models.User).filter(models.User.email == e).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def create_user(db: Session, email: str, display_name: str, role: str) -> models.User:
    if role not in VALID_ROLES:
        raise ValueError("Invalid role")
    name = display_name.strip()
    if len(name) < 1:
        raise ValueError("Name is required")
    row = models.User(
        id=str(uuid.uuid4()),
        email=email.strip().lower(),
        name=name,
        password_hash=_passwordless_placeholder_hash(),
        role=role,
        created_at=date.today().isoformat(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_users(db: Session) -> List[models.User]:
    return db.query(models.User).order_by(models.User.email).all()


def set_user_role(db: Session, user_id: str, role: str) -> Optional[models.User]:
    if role not in VALID_ROLES:
        raise ValueError("Invalid role")
    u = get_user_by_id(db, user_id)
    if not u:
        return None
    u.role = role
    db.commit()
    db.refresh(u)
    return u


def patch_user(
    db: Session,
    user_id: str,
    *,
    role: Optional[str] = None,
    name: Optional[str] = None,
) -> Optional[models.User]:
    u = get_user_by_id(db, user_id)
    if not u:
        return None
    if role is not None:
        if role not in VALID_ROLES:
            raise ValueError("Invalid role")
        u.role = role
    if name is not None:
        n = name.strip()
        if len(n) < 1:
            raise ValueError("Name cannot be empty")
        u.name = n
    db.commit()
    db.refresh(u)
    return u
