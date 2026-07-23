"""
Shared logging setup for the database/scripts/ data pipeline.

Every pipeline script gets its logger via `get_logger(name)` instead of
calling bare print(). That buys the whole pipeline, in one place:

  - Consistent timestamps + severity levels (INFO/WARNING/ERROR) instead of
    undifferentiated print() text with no way to tell "this is normal" from
    "this needs attention" without reading every line.
  - A persistent, on-disk record of every run under database/logs/, so
    output isn't lost the moment a terminal closes — this matters once the
    pipeline is driven by cron instead of a person watching a terminal.
  - One shared log file per calendar day across ALL steps of a single
    run_all.py invocation. Every script's logger is a child of the same
    "pipeline" root logger, so — regardless of which step wrote a line — it
    all lands in the same file in the order it happened, instead of being
    scattered across per-script output with no shared timeline.

Verbosity can be raised/lowered without touching code via the
PIPELINE_LOG_LEVEL env var, e.g.:
    PIPELINE_LOG_LEVEL=DEBUG python run_all.py

Deliberately NOT included here (kept out to avoid over-building this for a
single-maintainer project before there's an actual need):
  - Remote log shipping / alerting (Slack, email, etc.) — for now, a
    non-zero exit code (see run_all.py) is the signal; a cron MAILTO or
    similar can already act on that without any code here.
  - Structured (JSON) logs or a DB-backed run-history table — plain text is
    enough for the log volume this project produces; revisit if/when
    something needs to query run history programmatically.
  - Log file rotation/cleanup — one file per day is already coarse enough
    that manual cleanup of database/logs/ is unlikely to be a chore. Add a
    retention policy later if the directory actually grows unwieldy.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"

_LOG_FORMAT = "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def _configure_root() -> None:
    """
    Attach console + file handlers to the shared 'pipeline' logger.

    Safe to call any number of times, from any number of imported step
    modules, in any order — handlers are only installed once per process,
    so importing several pipeline scripts in one run_all.py invocation
    doesn't produce duplicated log lines.
    """
    global _configured
    if _configured:
        return
    _configured = True

    root = logging.getLogger("pipeline")
    root.setLevel(os.environ.get("PIPELINE_LOG_LEVEL", "INFO").upper())
    # Don't propagate to the root (un-named) logger's own handlers, in case
    # something else in-process configures those — avoids duplicate output.
    root.propagate = False

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(formatter)
    root.addHandler(console_handler)

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_file = LOG_DIR / f"pipeline_{datetime.now():%Y-%m-%d}.log"
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except OSError as e:
        # A read-only filesystem or permissions issue here shouldn't stop
        # the pipeline from running — fall back to console-only logging.
        root.warning(f"Could not open log file under {LOG_DIR}: {e}")


def get_logger(name: str) -> logging.Logger:
    """
    Return a logger under the shared 'pipeline' namespace, with console +
    on-disk handlers already attached (configured lazily on first call).

    Pass a short, stable identifier for the calling module (e.g.
    "omdb_api"), NOT `__name__`: __name__ is "__main__" when a script is
    run directly (`python omdb_api.py`) but the plain module name when
    imported by run_all.py's importlib.import_module(). Using `__name__`
    would split one script's logs across two different logger names
    depending on how it happened to be invoked.
    """
    _configure_root()
    return logging.getLogger(f"pipeline.{name}")
