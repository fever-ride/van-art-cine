CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE film_embedding (
  film_id     INT PRIMARY KEY REFERENCES film(id) ON DELETE CASCADE,
  embedding   vector(1536) NOT NULL,
  doc_text    TEXT NOT NULL,
  model       VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_film_embedding_cosine
  ON film_embedding USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
