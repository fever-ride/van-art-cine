# Data Pipeline Backlog

Ideas that came up while hardening `database/scripts/` but were deliberately
deferred — not urgent, not forgotten. Pick up whenever there's appetite.

## Done (kept here for context)

### Automate the pipeline with a scheduled GitHub Actions workflow

Implemented in `.github/workflows/pipeline.yml` + `scrapers/requirements.txt`:

- Cron every other day at 12:00 UTC, plus 0–60 min jitter on schedule runs
- Manual `workflow_dispatch` for dry runs from the Actions UI
- Scrapers (`run_all_scrapers.py --continue-on-error`) then
  `database/scripts/run_all.py --stop-on-error`
- Secrets materialized into `database/.env` (`PROD_DATABASE_URL`,
  `TMDB_API_KEY`, `OMDB_API_KEY`, `OPENAI_API_KEY`)
- Log artifact upload (`database/logs/`, 14-day retention)
- Failure notification today: GitHub Actions emails on workflow failure
  (covers "ran and failed", not "never ran at all")

## Still deferred

### Heartbeat / dead-man's-switch monitoring (e.g. healthchecks.io)

GitHub Actions already emails on workflow *failure*, but not if the
workflow never runs at all (bad cron expression, disabled workflow, billing
issue, etc.) — that failure mode produces no failure to email about.

When we pick this up:

- Create a healthchecks.io check (Simple schedule, Period **2 days**,
  Grace **~12 hours** to cover jitter + long runs). Suggested name:
  `vancine data pipeline`.
- Add repo secret `HEALTHCHECK_URL` = the check's ping URL
  (do not append `/start` or `/fail` yourself).
- Wire into `.github/workflows/pipeline.yml`:
  - start: `curl …/start`
  - success: `curl …` (bare URL)
  - failure: `curl …/fail`
- Map the secret to a job `env` first if using it in `if:` conditions
  (secrets cannot be referenced directly in `if` expressions).

Free tier is enough for this project's scale.

### Other deferred items

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
- Optional: separate scheduled job for `refresh_ratings.py` (weekly) —
  deliberately not part of the main pipeline so every run doesn't re-spend
  OMDb quota on already-enriched films.
