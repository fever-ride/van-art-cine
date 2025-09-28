-- =========================================
-- Init schema: single DB + staging + merge
-- =========================================
SET NAMES utf8mb4;

-- 1) Create database and switch to it
CREATE DATABASE IF NOT EXISTS vancine_test
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE vancine_test;

-- ========== CORE ENTITIES ==========
CREATE TABLE IF NOT EXISTS cinema (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  website VARCHAR(255),
  address VARCHAR(300),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS film (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  year SMALLINT,
  rated VARCHAR(16) NULL,
  genre VARCHAR(255) NULL,
  language VARCHAR(255) NULL,
  country VARCHAR(255) NULL,
  awards VARCHAR(255) NULL,
  rt_rating_pct TINYINT UNSIGNED NULL,
  imdb_rating DECIMAL(3,1) NULL,
  imdb_votes INT UNSIGNED NULL,
  description TEXT,
  normalized_title VARCHAR(255) GENERATED ALWAYS AS (
    TRIM(LOWER(REPLACE(REPLACE(title,'’',''''),'  ',' ')))
  ) STORED,
  imdb_id VARCHAR(16),
  tmdb_id INT,
  imdb_url VARCHAR(512) NULL,
  UNIQUE KEY uniq_title_year (normalized_title, year),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rt_rating_pct CHECK (rt_rating_pct IS NULL OR (rt_rating_pct BETWEEN 0 AND 100)),
  CONSTRAINT chk_imdb_rating   CHECK (imdb_rating IS NULL OR (imdb_rating >= 0.0 AND imdb_rating <= 10.0)),
  CONSTRAINT chk_imdb_votes    CHECK (imdb_votes IS NULL OR imdb_votes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS person (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  imdb_id VARCHAR(16),
  tmdb_id INT,
  normalized_name VARCHAR(160) GENERATED ALWAYS AS (
    TRIM(LOWER(REPLACE(REPLACE(name,'’',''''),'  ',' ')))
  ) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_person_norm (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS film_person (
  film_id INT NOT NULL,
  person_id INT NOT NULL,
  role ENUM('director','writer','cast','unknown') DEFAULT 'unknown',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (film_id, person_id, role),
  FOREIGN KEY (film_id)  REFERENCES film(id),
  FOREIGN KEY (person_id) REFERENCES person(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== SCREENING DATA (LIVE TABLE FOR APP QUERIES) ==========
CREATE TABLE IF NOT EXISTS screening (
  id INT AUTO_INCREMENT PRIMARY KEY,
  film_id INT NOT NULL,
  cinema_id INT NOT NULL,
  start_at_utc DATETIME NOT NULL,
  end_at_utc   DATETIME NOT NULL,
  runtime_min SMALLINT,
  tz VARCHAR(64) NOT NULL DEFAULT 'America/Vancouver',

	-- source tracking
	source         VARCHAR(32)  NOT NULL DEFAULT 'manual', -- 'viff' | 'cinematheque' | 'rio' | 'manual'
	source_uid     VARCHAR(128) NULL,                      -- upstream id; if none, use a stable derived uid
	source_url     VARCHAR(512) NOT NULL,
	content_hash   CHAR(64)     NULL,                      -- content fingerprint
	loaded_at_utc     DATETIME     NOT NULL,                  -- when we last saw this record upstream
	ingest_run_id  BIGINT       NULL,                      -- FK to current import batch record

  -- metadata
  notes VARCHAR(255),
  raw_date VARCHAR(80),
  raw_time VARCHAR(80),

  -- status & audit
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- keys
  UNIQUE KEY uniq_show    (cinema_id, film_id, start_at_utc),
  UNIQUE KEY uniq_src_uid (source, source_uid),
  KEY idx_when    (start_at_utc),
  KEY idx_film    (film_id),
  KEY idx_cinema  (cinema_id),
  KEY idx_active_src (is_active, source),

  FOREIGN KEY (film_id)   REFERENCES film(id),
  FOREIGN KEY (cinema_id) REFERENCES cinema(id),
  CONSTRAINT chk_screening_time CHECK (end_at_utc >= start_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== RAW IMPORT HISTORY ==========
CREATE TABLE IF NOT EXISTS raw_import (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cinema_id INT NOT NULL,
  source    VARCHAR(32) NOT NULL,
  fetched_at DATETIME NOT NULL,
  payload JSON NOT NULL,
  rows_processed INT DEFAULT 0,
  FOREIGN KEY (cinema_id) REFERENCES cinema(id),
  KEY idx_fetched    (fetched_at),
  KEY idx_src_fetched (source, fetched_at),
  KEY idx_cinema (cinema_id),
  KEY idx_cinema_fetched (cinema_id, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== ETL STAGING ==========
CREATE TABLE IF NOT EXISTS stg_screening (
  film_id      INT NOT NULL,
  cinema_id    INT NOT NULL,
  start_at_utc DATETIME NOT NULL,
  end_at_utc   DATETIME NOT NULL,
  runtime_min  SMALLINT NULL,
  tz VARCHAR(64) NOT NULL DEFAULT 'America/Vancouver',
  source     VARCHAR(32)  NOT NULL,
  source_uid VARCHAR(128) NOT NULL,
  source_url VARCHAR(512) NOT NULL,
  notes      VARCHAR(255) NULL,
  raw_date   VARCHAR(80)  NULL,
  raw_time   VARCHAR(80)  NULL,
  content_hash CHAR(64)   NOT NULL,
  loaded_at_utc   DATETIME   NOT NULL,
  loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stg_src_uid (source, source_uid),
  KEY idx_stg_time (start_at_utc),
  FOREIGN KEY (film_id)   REFERENCES film(id),
  FOREIGN KEY (cinema_id) REFERENCES cinema(id),
  CONSTRAINT chk_stg_time CHECK (end_at_utc >= start_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== INGEST RUN LOG ==========
CREATE TABLE IF NOT EXISTS ops_ingest_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source      VARCHAR(32) NOT NULL,
  started_at  DATETIME    NOT NULL,
  finished_at DATETIME    NULL,
  rows_in         INT NOT NULL DEFAULT 0,
  rows_inserted   INT NOT NULL DEFAULT 0,
  rows_updated    INT NOT NULL DEFAULT 0,
  rows_deactivated INT NOT NULL DEFAULT 0,
  status ENUM('running','success','error') NOT NULL DEFAULT 'running',
  message VARCHAR(500) NULL,
  KEY idx_src_started (source, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link screening.ingest_run_id to run table
ALTER TABLE screening
  ADD CONSTRAINT fk_screening_ingest
  FOREIGN KEY (ingest_run_id) REFERENCES ops_ingest_run(id);

-- ========== USER FEATURES ==========
CREATE TABLE IF NOT EXISTS app_user (
  uid VARCHAR(128) PRIMARY KEY,
  display_name VARCHAR(160),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_event (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_at_utc DATETIME NOT NULL,
  end_at_utc   DATETIME NOT NULL,
  tz VARCHAR(64) NOT NULL DEFAULT 'America/Vancouver',
  cinema_text VARCHAR(255) NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES app_user(uid),
  KEY idx_user_time (uid, start_at_utc),
  CONSTRAINT chk_custom_time CHECK (end_at_utc > start_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_schedule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  screening_id INT NULL,
  custom_event_id INT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK ((screening_id IS NOT NULL) XOR (custom_event_id IS NOT NULL)),
  UNIQUE KEY uniq_user_screening (uid, screening_id),
  UNIQUE KEY uniq_user_custom (uid, custom_event_id),
  FOREIGN KEY (uid) REFERENCES app_user(uid),
  FOREIGN KEY (screening_id)  REFERENCES screening(id) ON DELETE CASCADE,
  FOREIGN KEY (custom_event_id) REFERENCES custom_event(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ical_feed (
  uid VARCHAR(128) PRIMARY KEY,
  secret_token CHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES app_user(uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminder (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  user_schedule_id INT NOT NULL,
  minutes_before INT NOT NULL DEFAULT 60,
  channel ENUM('email','push') DEFAULT 'email',
  is_active TINYINT(1) DEFAULT 1,
  FOREIGN KEY (uid) REFERENCES app_user(uid),
  FOREIGN KEY (user_schedule_id) REFERENCES user_schedule(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;