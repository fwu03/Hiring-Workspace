"""ORM models — all durable hiring data lives here."""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.connection import Base


class User(Base):
    """Application user — passwordless: display name + email identify the account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(32), default="viewer")
    created_at: Mapped[str] = mapped_column(String(32))


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tag: Mapped[str] = mapped_column(String(512))
    created_date: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    upload_complete: Mapped[bool] = mapped_column(Boolean, default=True)
    llm_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    candidates: Mapped[List["Candidate"]] = relationship(
        "Candidate",
        back_populates="batch",
        cascade="all, delete-orphan",
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(36), ForeignKey("batches.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(256))
    email: Mapped[str] = mapped_column(String(256))
    phone: Mapped[str] = mapped_column(String(64), default="")
    years_of_experience: Mapped[int] = mapped_column(Integer, default=0)
    school: Mapped[str] = mapped_column(String(256), default="")
    degree: Mapped[str] = mapped_column(String(256), default="")
    flags_json: Mapped[str] = mapped_column(Text, default="{}")
    llm_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    llm_rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="new")
    hm_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resume_text: Mapped[str] = mapped_column(Text, default="")
    history_json: Mapped[str] = mapped_column(Text, default="[]")
    interview_rounds_json: Mapped[str] = mapped_column(Text, default="[]")
    interview_workspace_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resume_pdf_present: Mapped[bool] = mapped_column(Boolean, default=False)

    batch: Mapped["Batch"] = relationship("Batch", back_populates="candidates")
