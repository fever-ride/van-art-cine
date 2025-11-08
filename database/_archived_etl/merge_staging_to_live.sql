START TRANSACTION;

-- 0) start a run
INSERT INTO ops_ingest_run (started_at, status)
VALUES (NOW(), 'running');
SET @run_id := LAST_INSERT_ID();

-- 1) how many rows are in staging right now (all sources)
SELECT COUNT(*) INTO @rows_in
FROM stg_screening;

-- 2) INSERT new rows (no existing live row with same (source, source_uid))
INSERT INTO screening (
  film_id, cinema_id, start_at_utc, end_at_utc, runtime_min, tz,
  source, source_uid, source_url, notes, raw_date, raw_time,
  content_hash, loaded_at_utc, ingest_run_id, is_active, created_at, updated_at
)
SELECT
  s.film_id, s.cinema_id, s.start_at_utc, s.end_at_utc, s.runtime_min, s.tz,
  s.source, s.source_uid, s.source_url, s.notes, s.raw_date, s.raw_time,
  s.content_hash, s.loaded_at_utc, @run_id, 1, NOW(), NOW()
FROM stg_screening s
LEFT JOIN screening t
  ON t.source = s.source AND t.source_uid = s.source_uid
WHERE t.id IS NULL;
SET @rows_inserted := ROW_COUNT();

-- 3) UPDATE existing rows only if something significant changed
--    (also marks them active and ties them to this run)
UPDATE screening t
JOIN stg_screening s
  ON t.source = s.source AND t.source_uid = s.source_uid
SET
  t.film_id       = s.film_id,
  t.cinema_id     = s.cinema_id,
  t.start_at_utc  = s.start_at_utc,
  t.end_at_utc    = s.end_at_utc,
  t.runtime_min   = s.runtime_min,
  t.tz            = s.tz,
  t.source_url    = s.source_url,
  t.notes         = s.notes,
  t.raw_date      = s.raw_date,
  t.raw_time      = s.raw_time,
  t.content_hash  = s.content_hash,
  t.loaded_at_utc = s.loaded_at_utc,
  t.ingest_run_id = @run_id,
  t.is_active     = 1,
  t.updated_at    = NOW()
WHERE
  -- update only when changed (prevents inflating the counter)
  (
    t.film_id      <> s.film_id      OR
    t.cinema_id    <> s.cinema_id    OR
    t.start_at_utc <> s.start_at_utc OR
    t.end_at_utc   <> s.end_at_utc   OR
    (t.runtime_min <=> s.runtime_min) = 0 OR  -- NULL-safe compare
    t.tz           <> s.tz           OR
    t.source_url   <> s.source_url   OR
    (t.notes       <=> s.notes) = 0  OR
    (t.raw_date    <=> s.raw_date) = 0 OR
    (t.raw_time    <=> s.raw_time) = 0 OR
    t.content_hash <> s.content_hash OR
    t.is_active    = 0
  );
SET @rows_updated := ROW_COUNT();

-- 4) deactivate any live row NOT touched in this run
UPDATE screening
SET is_active = 0
WHERE is_active = 1
  AND (ingest_run_id IS NULL OR ingest_run_id <> @run_id);
SET @rows_deactivated := ROW_COUNT();

-- 5) finish the run and store counters
UPDATE ops_ingest_run
SET finished_at      = NOW(),
    status           = 'success',
    rows_in          = @rows_in,
    rows_inserted    = @rows_inserted,
    rows_updated     = @rows_updated,
    rows_deactivated = @rows_deactivated
WHERE id = @run_id;

COMMIT;