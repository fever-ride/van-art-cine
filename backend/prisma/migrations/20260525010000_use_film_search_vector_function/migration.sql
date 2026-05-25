CREATE OR REPLACE FUNCTION film_search_vector(
  title text,
  normalized_title text,
  genre text,
  description text
) RETURNS tsvector
IMMUTABLE
LANGUAGE sql
AS $$
  SELECT
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(normalized_title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
$$;

DROP INDEX IF EXISTS idx_film_search_vector;

CREATE INDEX IF NOT EXISTS idx_film_search_vector
  ON film USING GIN (
    film_search_vector(title, normalized_title, genre, description)
  );
