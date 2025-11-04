Database folder layout and usage

This README documents the recommended structure for the `database/` folder and
how to safely run the ETL + merge workflow.

Recommended structure (current layout may vary):

- database/
  - .env # local, gitignored; contains DB\_\* and API keys
  - .env.example # example file with placeholders (do not commit secrets)
  - \_archived_migrations/ # archived MySQL schema (no longer in use)
  - etl/
    - merge_staging_to_live.sql # SQL script that promotes staging to live
  - scripts/ # Python helper scripts (loaders, lookups, runner)
  - backups/ # (future plan) manual DB export / snapshots

Guidelines and best practices

- Keep secrets out of source code. Use `.env` for local development. The
  project includes `.env.example` as a template; copy it to `.env` and fill in
  your values (DB credentials, TMDB/OMDB API keys). The scripts load `.env`
  automatically from the `database/` directory.

Running the loader + merge (safe workflow)

The repository provides a convenience runner at `database/scripts/run_all.py`.
This script runs the ETL and lookup steps in a predictable order and can
optionally execute the merge SQL that promotes staged rows to the live
`screening` table.

Key points about `run_all.py`:

- Default steps (when you run `run_all.py` with no flags):

  1. `load_json` — parse JSON files and populate staging
  2. `resolve_imdb_id_url` — lookup TMDB/IMDb ids/URLs for films
  3. `omdb_api` — fetch OMDb metadata

- The `merge` step is NOT run by default. This is intentional — the merge
  promotes staging to live and therefore should be opt-in.

- How to run merge:

  - Run all steps including merge (explicit):

    python database/scripts/run_all.py --merge

  - Run specific steps and include merge:

    python database/scripts/run_all.py --steps load_json,resolve_imdb_id_url --merge

  - Run only the merge step (when staging is already prepared and validated):

    python database/scripts/run_all.py --steps merge

- Useful flags:
  - `--stop-on-error` — stop execution when a step fails (recommended when
    running with `--merge`)
  - `--steps` — comma-separated list of steps to run (e.g. `--steps load_json,omdb_api`)

Implementation notes (why it's safe):

- `run_all.py` imports each module and invokes its `main()` while ensuring the
  imported module does not see the runner's CLI flags. This prevents flags
  like `--merge` from being misinterpreted as file paths by the individual
  scripts.

- The `merge` step reads and executes `etl/merge_staging_to_live.sql`. The
  SQL includes an explicit `START TRANSACTION` / `COMMIT` so the promotion is
  performed atomically; on error the transaction is rolled back.

Safety and backups

- Always back up production data before running the `merge` on a production
  instance. The runner will not create backups automatically.

- Consider adding a `--dry-run` option (not currently implemented) which
  executes the merge SQL but forces a rollback to let you validate effects.

Suggested next steps (optional)

- If you'd like the tree to be stricter, we can move the implementation
  scripts into `database/scripts/impl/` and leave thin CLI files in
  `database/scripts/` that call into `impl`. That reduces top-level import
  side effects and makes testing easier.

- I can also add a small `database/etl/README.md` that documents the merge SQL
  semantics and a simple checklist to run before merging (backup, validate
  staging counts, etc.).

If you'd like, tell me which of the optional follow-ups you'd like me to do
next (dry-run, move scripts into a package, or add pre-merge checklist docs).
