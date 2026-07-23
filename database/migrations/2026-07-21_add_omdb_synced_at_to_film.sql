-- Adds a dedicated timestamp to track when a film's OMDb data was last
-- successfully fetched, so the enrichment pipeline can tell "never enriched"
-- apart from "enriched, but OMDb happened to return no data for this field"
-- (e.g. NULL description on an obscure title), and so a separate ratings
-- refresh job can select films by staleness instead of re-fetching everything.
--
-- NOT applied via Prisma Migrate: this project's schema changes are done by
-- hand-written SQL run directly against the database, with schema.prisma
-- kept in sync manually afterward (see database/_archived_migrations/ for
-- the pre-Postgres precedent; this file is the equivalent going forward).
--
-- Applied to:
--   [x] local  (vancine @ localhost) — 2026-07-21
--   [ ] production (vancine_postgres @ Render)

ALTER TABLE film
  ADD COLUMN IF NOT EXISTS omdb_synced_at TIMESTAMP(0) NULL;

COMMENT ON COLUMN film.omdb_synced_at IS
  'Last time OMDb enrichment (omdb_api.py) successfully wrote data for this film. NULL = never enriched.';
