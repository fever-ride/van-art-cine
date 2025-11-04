CREATE TABLE IF NOT EXISTS watchlist_screening (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_uid      BIGINT UNSIGNED NOT NULL,
  -- consider changing to bigint, unsigned
  screening_id  INT NOT NULL,

  -- optional metadata
  status        ENUM('planned','watched') NOT NULL DEFAULT 'planned',
  note          VARCHAR(500) NULL,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,

  -- prevent duplicates (same user saving the same screening twice)
  UNIQUE KEY uq_user_screening (user_uid, screening_id),

  KEY idx_user (user_uid),
  KEY idx_screening (screening_id),

  CONSTRAINT fk_wl_user
    FOREIGN KEY (user_uid) REFERENCES app_user(uid)
    ON DELETE CASCADE,

  CONSTRAINT fk_wl_screening
    FOREIGN KEY (screening_id) REFERENCES screening(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;