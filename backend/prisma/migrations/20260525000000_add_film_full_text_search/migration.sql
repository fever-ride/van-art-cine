CREATE INDEX IF NOT EXISTS idx_film_search_vector
  ON film USING GIN ((
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(normalized_title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
  ));
