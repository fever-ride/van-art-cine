DROP TABLE IF EXISTS reminder;
DROP TABLE IF EXISTS user_schedule;
DROP TABLE IF EXISTS custom_event;
DROP TABLE IF EXISTS ical_feed;
DROP TABLE IF EXISTS app_user;

CREATE TABLE app_user (
  uid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recreate user_schedule
CREATE TABLE user_schedule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_uid BIGINT UNSIGNED NOT NULL,
  schedule_data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_uid) REFERENCES app_user(uid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recreate custom_event
CREATE TABLE custom_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_uid BIGINT UNSIGNED NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_uid) REFERENCES app_user(uid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh token table (good for future rotation/revocation)
CREATE TABLE IF NOT EXISTS refresh_token (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  token        CHAR(64) NOT NULL,      -- store hashed token (e.g., hex-encoded SHA-256)
  expires_at   DATETIME NOT NULL,
  revoked_at   DATETIME NULL,
  user_agent   VARCHAR(255) NULL,
  ip           VARCHAR(64) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refresh_token (token),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_unrev_expires (user_id, revoked_at, expires_at),
  CONSTRAINT fk_refresh_user
    FOREIGN KEY (user_id) REFERENCES app_user(uid)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;