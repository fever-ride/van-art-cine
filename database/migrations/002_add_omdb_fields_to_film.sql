-- Add OMDb-derived fields to film
START TRANSACTION;

ALTER TABLE film
    ADD COLUMN rated VARCHAR(16) NULL AFTER year;

ALTER TABLE film
    ADD COLUMN genre VARCHAR(255) NULL AFTER rated;

ALTER TABLE film
    ADD COLUMN language VARCHAR(255) NULL AFTER genre;

ALTER TABLE film
    ADD COLUMN country VARCHAR(255) NULL AFTER language;

ALTER TABLE film
    ADD COLUMN awards VARCHAR(255) NULL AFTER country;

ALTER TABLE film
    ADD COLUMN rt_rating_pct TINYINT UNSIGNED NULL AFTER awards;

ALTER TABLE film
    ADD COLUMN imdb_rating DECIMAL(3,1) NULL AFTER rt_rating_pct;

ALTER TABLE film
    ADD COLUMN imdb_votes INT UNSIGNED NULL AFTER imdb_rating;

ALTER TABLE film
    ADD CONSTRAINT chk_rt_rating_pct CHECK (rt_rating_pct IS NULL OR (rt_rating_pct BETWEEN 0 AND 100));

ALTER TABLE film
    ADD CONSTRAINT chk_imdb_rating CHECK (imdb_rating IS NULL OR (imdb_rating >= 0.0 AND imdb_rating <= 10.0));

ALTER TABLE film
    ADD CONSTRAINT chk_imdb_votes CHECK (imdb_votes IS NULL OR imdb_votes >= 0);

COMMIT;
