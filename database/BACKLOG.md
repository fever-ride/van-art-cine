# Data Pipeline Backlog

Ideas that came up while hardening `database/scripts/` but were deliberately
deferred — not urgent, not forgotten. Pick up whenever there's appetite.

## Automate the pipeline with a scheduled GitHub Actions workflow

Currently the pipeline (scrapers → `database/scripts/run_all.py`) is run
manually, from a laptop. To make it "real" automation instead of best-effort:

- Add `.github/workflows/pipeline.yml` with a `schedule:` (cron) trigger.
- One job, sequential steps: checkout → install deps (scrapers +
  `database/requirements.txt`) → run scrapers → run `run_all.py`.
  Scraper output (`data/latest/*.json`) only needs to exist within that same
  job run — `data/` is already gitignored, so there's no persistence
  requirement across runs.
- Store `TMDB_API_KEY`, `OMDB_API_KEY`, `OPENAI_API_KEY`, and the production
  `DATABASE_URL` (Render) as GitHub Actions Secrets.
- Each pipeline step becomes its own workflow `step`, so pass/fail per step
  is visible in the Actions UI without opening logs. Existing `log.info`/
  `log.error` output (already structured, already includes per-step
  success/failure counts) shows up in the step's captured stdout/stderr —
  no extra work needed for basic observability.
- Optional: `actions/upload-artifact` for `database/logs/*.log` if we want a
  single downloadable log file per run instead of relying on the Actions UI.

Why not a bigger orchestrator (Airflow/Prefect/Step Functions): overkill for
a single sequential pipeline maintained by one person. Revisit only if the
pipeline grows into many interdependent DAGs or needs frequent historical
backfills.

## Heartbeat / dead-man's-switch monitoring (e.g. healthchecks.io)

GitHub Actions already emails on workflow *failure*, but not if the
workflow never runs at all (bad cron expression, disabled workflow, billing
issue, etc.) — that failure mode produces no failure to email about.

- Add a healthchecks.io (or similar) check with the expected schedule.
- Ping it (e.g. `curl $HEALTHCHECK_URL`) at the start and end of the
  workflow run (or wrap the whole job with `curl .../start` ... `curl
  .../$STATUS`).
- Free tier is enough for this project's scale; ~10 minutes to set up.

## Deferred from the same discussion (not currently planned, listed for context)

- `refresh_ratings.py --limit` currently defaults to unbounded (`None`).
  Flagged as a "safe default" design smell (unbounded should be the
  explicit opt-in, not the default) but not changed — no action taken yet.
- No run-scoped "undo" tooling. `merge_staging_to_live.py` already tags
  written `screening` rows with `ops_ingest_run.id` (via `ingest_run_id`),
  which *could* back a "revert this specific run" script, but no such
  script exists. The per-row-commit steps (`omdb_api.py`,
  `resolve_imdb_id_url.py`, `enrich_person_ids.py`, `refresh_ratings.py`)
  have no equivalent run-id tagging at all. Real rollback today means
  manual SQL / `edit_screenings_manual.py`, or a Render point-in-time
  restore (undoes everything after a timestamp, not just the bad run).
- Log aggregation platform (Loki/Better Stack/Datadog, etc.): not needed
  yet. If wanted later, add a second `logging.Handler` in
  `log_setup.py` alongside the existing console/file handlers — decoupled
  from wherever the pipeline happens to run.
