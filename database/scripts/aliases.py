# aliases.py
from __future__ import annotations

import re
import unicodedata
from typing import Dict, Tuple, Optional

# Keyed by (source_name, alias_name) → canonical cinema name
# Keep canonical names exactly as you want them displayed.
CINEMA_ALIASES: Dict[Tuple[str, str], str] = {
    ("viff", "the rio theatre"): "Rio Theatre",
    ("viff", "rio theatre"): "Rio Theatre",
    ("cinematheque", "the cinematheque"): "The Cinematheque",
}

# Optional: global, cross-source fallbacks (applied if per-source lookup fails)
GLOBAL_ALIASES: Dict[str, str] = {
    "rio theatre": "Rio Theatre",
    "the cinematheque": "The Cinematheque",
    "cinematheque": "The Cinematheque",
}


def _normalize(s: str) -> str:
    """
    Normalize a cinema name for matching:
    - Unicode NFKD + strip accents
    - Lowercase (casefold)
    - Remove most punctuation
    - Collapse whitespace
    - Remove leading 'the ' article
    """
    if not s:
        return ""

    # Unicode normalize and strip accents
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))

    # Lowercase (casefold is more robust)
    s = s.casefold()

    # Replace common joiners
    s = s.replace("&", "and")

    # Remove punctuation except intra-word hyphens/apostrophes
    s = re.sub(r"[.,;:!/?()\[\]{}\"“”‘’]+", " ", s)

    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()

    # Drop leading article "the "
    s = re.sub(r"^the\s+", "", s)

    return s


def resolve_cinema_alias(source: str, scraped_name: str) -> Optional[str]:
    """
    Resolve a scraped cinema name to a canonical display name.

    Matching strategy:
      1) Exact per-source alias table (after normalization)
      2) Global alias table (after normalization)
      3) No match → None (caller should fall back to scraped_name)
    """
    ns = _normalize(source)
    nn = _normalize(scraped_name)

    # 1) Per-source lookup
    hit = CINEMA_ALIASES.get((ns, nn))
    if hit:
        return hit

    # 2) Global fallback
    hit = GLOBAL_ALIASES.get(nn)
    if hit:
        return hit

    # 3) No mapping → let caller use original
    return None
