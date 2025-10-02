-- mysql -u user -p dbname < scripts/validate_staging.sql

-- 1. Duplicate venue names pointing to multiple cinema IDs
SELECT venue_name, COUNT(DISTINCT cinema_id) dup_ids,
       GROUP_CONCAT(DISTINCT cinema_id) ids
FROM stg_screening
GROUP BY venue_name
HAVING COUNT(DISTINCT cinema_id) > 1;

-- 2. Screenings in the past
SELECT id, film_id, cinema_id, start_at_utc
FROM stg_screening
WHERE start_at_utc < UTC_TIMESTAMP();

-- 3. Missing or empty required fields
SELECT id, film_id, cinema_id, start_at_utc
FROM stg_screening
WHERE film_id IS NULL OR venue_name = '';

-- 4. Unusual screening times (e.g., late night 0-5 AM)
SELECT id, film_id, cinema_id, start_at_utc
FROM stg_screening
WHERE HOUR(start_at_utc) BETWEEN 0 AND 5;
