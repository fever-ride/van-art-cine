from datetime import datetime
import hashlib


def stable_uid(cinema_id: int, film_id: int, start_at_utc: datetime) -> str:
    """Stable synthetic UID when upstream has no ID."""
    key = f"{cinema_id}|{film_id}|{start_at_utc:%Y-%m-%d %H:%M:%S}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


dt = datetime(2025, 11, 11, 4, 9, 0)
result = stable_uid(116, 160, dt)
print(result)
