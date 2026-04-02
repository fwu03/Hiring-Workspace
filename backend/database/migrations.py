"""Lightweight SQLite migrations for additive columns."""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_sqlite_migrations(engine: Engine) -> None:
    """Add columns missing from older DB files."""
    insp = inspect(engine)
    if not insp.has_table("users"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE users (
                        id VARCHAR(36) PRIMARY KEY,
                        email VARCHAR(256) NOT NULL UNIQUE,
                        name VARCHAR(256) NOT NULL DEFAULT '',
                        password_hash VARCHAR(512) NOT NULL,
                        role VARCHAR(32) NOT NULL DEFAULT 'viewer',
                        created_at VARCHAR(32) NOT NULL
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
    insp = inspect(engine)
    if insp.has_table("users"):
        ucols = {c["name"] for c in insp.get_columns("users")}
        if "name" not in ucols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(256) NOT NULL DEFAULT ''"))
    if not insp.has_table("candidates"):
        return
    cols = {c["name"] for c in insp.get_columns("candidates")}
    if "resume_pdf_present" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE candidates ADD COLUMN resume_pdf_present BOOLEAN DEFAULT 0"))
    if "llm_rationale" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE candidates ADD COLUMN llm_rationale TEXT"))
