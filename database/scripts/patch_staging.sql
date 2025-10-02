-- Standardize venue name aliases
UPDATE stg_screening
SET venue_name = 'Rio Theatre'
WHERE LOWER(venue_name) IN ('the rio theatre', 'rio theater');

-- Fix incorrect screening time
UPDATE stg_screening
SET start_at_utc = '2025-10-03 19:30:00'
WHERE id = 12345;

-- If you have a fix table, you can use this approach:
INSERT INTO stg_fix_screening(source, source_uid, fixed_venue_name, updated_by, updated_at)
VALUES ('viff', 'abc123', 'Rio Theatre', 'wendy', NOW())
ON DUPLICATE KEY UPDATE fixed_venue_name=VALUES(fixed_venue_name), updated_at=NOW();