"""Normalize display names for passwordless sign-in (name + email)."""


def normalize_display_name(name: str) -> str:
    """Case-insensitive compare; collapse internal whitespace."""
    return " ".join(name.strip().split()).casefold()


def names_match(stored: str, provided: str) -> bool:
    """True if the stored name is non-empty and matches the sign-in name."""
    if not stored or not stored.strip():
        return False
    return normalize_display_name(stored) == normalize_display_name(provided)
