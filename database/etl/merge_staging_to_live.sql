-- Purpose:
--   Merge data from staging table (stg_screening) into the live table (screening)
--   in an idempotent way. Run this after each crawler/import job.

START TRANSACTION;

-- 1. Record the start of this ingest run
-- source incorrect, needs update
INSERT INTO ops_ingest_run(source, started_at, status)
VALUES ('viff', NOW(), 'running');
SET @run_id = LAST_INSERT_ID();

-- 2. Upsert (insert or update) rows from staging into live table
--    If a row with the same (source, source_uid) already exists:
--      - update content_hash and loaded_at_utc
--      - mark it as active
--    Otherwise insert a new row
INSERT INTO screening (
    film_id, cinema_id, start_at_utc, end_at_utc,
    runtime_min, tz,
    source, source_uid, source_url,
    notes, raw_date, raw_time,
    content_hash, loaded_at_utc, ingest_run_id
)
SELECT
    film_id, cinema_id, start_at_utc, end_at_utc,
    runtime_min, tz,
    source, source_uid, source_url,
    notes, raw_date, raw_time,
    content_hash, loaded_at_utc, @run_id
FROM stg_screening
ON DUPLICATE KEY UPDATE
    content_hash   = VALUES(content_hash),
    loaded_at_utc     = VALUES(loaded_at_utc),
    ingest_run_id  = @run_id,
    is_active      = 1,
    updated_at     = CURRENT_TIMESTAMP;

-- 3. Deactivate old rows for this source
--    Any existing live rows whose ingest_run_id is not from the current run
--    are considered outdated and set is_active = 0.
UPDATE screening
SET is_active = 0
WHERE source = 'viff'
  AND ingest_run_id <> @run_id;

-- 4. Mark the ingest run as successful
UPDATE ops_ingest_run
SET finished_at = NOW(),
    status      = 'success'
WHERE id = @run_id;

COMMIT;