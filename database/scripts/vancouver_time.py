"""
Vancouver local time <-> UTC, independent of the host's tzdata.

British Columbia moved to permanent UTC-7 on 2026-11-01 02:00 PDT
(IANA tzdata 2026c). Python's zoneinfo reads whatever tzdata the host
provides (system files, Anaconda's bundle, or the `tzdata` package); an
older copy still falls back to UTC-8, which would store every showtime one
hour late. So we pin the post-change offset ourselves and only defer to
zoneinfo for instants before the change, where all tzdata versions agree.

See TROUBLESHOOTING.md -> "Showtimes off by one hour".
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

LEGACY_TZ = ZoneInfo("America/Vancouver")
FIXED_UTC_MINUS_7 = timezone(timedelta(hours=-7), "PT")
# 2026-11-01 02:00 local == 09:00 UTC; local wall-clock cutoff is the same instant.
PERMANENT_UTC7_FROM_UTC = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
PERMANENT_UTC7_FROM_LOCAL = datetime(2026, 11, 1, 2, 0)


def vancouver_tz_for_local(naive_local: datetime):
    """tzinfo to attach to a naive Vancouver wall-clock time."""
    return FIXED_UTC_MINUS_7 if naive_local >= PERMANENT_UTC7_FROM_LOCAL else LEGACY_TZ


def localize(naive_local: datetime) -> datetime:
    """Attach the correct Vancouver offset to a naive local datetime."""
    return naive_local.replace(tzinfo=vancouver_tz_for_local(naive_local))


def vancouver_now() -> datetime:
    """Current time in Vancouver (aware)."""
    now = datetime.now(timezone.utc)
    return now.astimezone(FIXED_UTC_MINUS_7 if now >= PERMANENT_UTC7_FROM_UTC else LEGACY_TZ)


def to_utc_naive(local_dt: datetime) -> datetime:
    """Vancouver local datetime (naive or aware) -> naive UTC for DATETIME columns."""
    if local_dt.tzinfo is None:
        local_dt = localize(local_dt)
    return local_dt.astimezone(timezone.utc).replace(tzinfo=None)
