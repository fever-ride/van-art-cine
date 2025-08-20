SET NAMES utf8mb4;

-- Entities
CREATE TABLE cinema (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(120) NOT NULL UNIQUE,
                        website VARCHAR(255),
                        address VARCHAR(300),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE venue (
                       id INT AUTO_INCREMENT PRIMARY KEY,
                       cinema_id INT NOT NULL,
                       name VARCHAR(160) NOT NULL,
                       address VARCHAR(300),
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                       UNIQUE KEY uniq_cinema_venue (cinema_id, name),
                       FOREIGN KEY (cinema_id) REFERENCES cinema(id)
);

CREATE TABLE film (
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
                          TRIM(LOWER(REPLACE(REPLACE(title,'’','\''),'  ',' ')))
                          ) STORED,
                      imdb_id VARCHAR(16),
                      tmdb_id INT,
                      UNIQUE KEY uniq_title_year (normalized_title, year),
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      CONSTRAINT chk_rt_rating_pct CHECK (rt_rating_pct IS NULL OR (rt_rating_pct BETWEEN 0 AND 100)),
                      CONSTRAINT chk_imdb_rating CHECK (imdb_rating IS NULL OR (imdb_rating >= 0.0 AND imdb_rating <= 10.0)),
                      CONSTRAINT chk_imdb_votes CHECK (imdb_votes IS NULL OR imdb_votes >= 0)
);

CREATE TABLE person (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(160) NOT NULL,
                        imdb_id VARCHAR(16),
                        tmdb_id INT,
                        normalized_name VARCHAR(160) GENERATED ALWAYS AS (
                            TRIM(LOWER(REPLACE(REPLACE(name,'’','\''),'  ',' ')))
                            ) STORED,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uniq_person_norm (normalized_name)
);

CREATE TABLE film_person (
                             film_id INT NOT NULL,
                             person_id INT NOT NULL,
                             role ENUM('director','writer','cast','unknown') DEFAULT 'unknown',
                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                             PRIMARY KEY (film_id, person_id, role),
                             FOREIGN KEY (film_id) REFERENCES film(id),
                             FOREIGN KEY (person_id) REFERENCES person(id)
);

-- Public events
CREATE TABLE screening (
                           id INT AUTO_INCREMENT PRIMARY KEY,
                           film_id INT NOT NULL,
                           venue_id INT NOT NULL,
                           start_at_utc DATETIME NOT NULL,
                           end_at_utc   DATETIME NOT NULL,
                           runtime_min SMALLINT,
                           tz VARCHAR(64) NOT NULL DEFAULT 'America/Vancouver',
                           source_url VARCHAR(512) NOT NULL,
                           notes VARCHAR(255),
                           raw_date VARCHAR(80), raw_time VARCHAR(80),
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                           UNIQUE KEY uniq_show (venue_id, film_id, start_at_utc),
                           KEY idx_when (start_at_utc),
                           KEY idx_film (film_id),
                           KEY idx_venue (venue_id),
                           FOREIGN KEY (film_id) REFERENCES film(id),
                           FOREIGN KEY (venue_id) REFERENCES venue(id),
                           CONSTRAINT chk_screening_time CHECK (end_at_utc >= start_at_utc)
);

-- Raw payloads (keep history)
CREATE TABLE raw_import (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            cinema_id INT NOT NULL,
                            fetched_at DATETIME NOT NULL,
                            payload JSON NOT NULL,
                            FOREIGN KEY (cinema_id) REFERENCES cinema(id),
                            KEY idx_fetched (fetched_at)
);

-- Users (Firebase Auth UID)
CREATE TABLE app_user (
                          uid VARCHAR(128) PRIMARY KEY,
                          display_name VARCHAR(160),
                          email VARCHAR(255),
                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Manual events users add
CREATE TABLE custom_event (
                              id INT AUTO_INCREMENT PRIMARY KEY,
                              uid VARCHAR(128) NOT NULL,
                              title VARCHAR(255) NOT NULL,
                              description TEXT NULL,
                              start_at_utc DATETIME NOT NULL,
                              end_at_utc   DATETIME NOT NULL,
                              tz VARCHAR(64) NOT NULL DEFAULT 'America/Vancouver',
                              venue_text VARCHAR(255) NULL,
                              notes VARCHAR(255) NULL,
                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                              FOREIGN KEY (uid) REFERENCES app_user(uid),
                              KEY idx_user_time (uid, start_at_utc),
                              CONSTRAINT chk_custom_time CHECK (end_at_utc > start_at_utc)
);

-- User's plan (link to either a screening or a custom event)
CREATE TABLE user_schedule (
                               id INT AUTO_INCREMENT PRIMARY KEY,
                               uid VARCHAR(128) NOT NULL,
                               screening_id INT NULL,
                               custom_event_id INT NULL,
                               added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                               CHECK ((screening_id IS NOT NULL) XOR (custom_event_id IS NOT NULL)),
                               UNIQUE KEY uniq_user_screening (uid, screening_id),
                               UNIQUE KEY uniq_user_custom (uid, custom_event_id),
                               FOREIGN KEY (uid) REFERENCES app_user(uid),
                               FOREIGN KEY (screening_id) REFERENCES screening(id),
                               FOREIGN KEY (custom_event_id) REFERENCES custom_event(id)
);

-- Private iCal feed per user
CREATE TABLE ical_feed (
                           uid VARCHAR(128) PRIMARY KEY,
                           secret_token CHAR(32) NOT NULL,
                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                           FOREIGN KEY (uid) REFERENCES app_user(uid)
);

-- Optional reminders
CREATE TABLE reminder (
                          id INT AUTO_INCREMENT PRIMARY KEY,
                          uid VARCHAR(128) NOT NULL,
                          user_schedule_id INT NOT NULL,
                          minutes_before INT NOT NULL DEFAULT 60,
                          channel ENUM('email','push') DEFAULT 'email',
                          is_active TINYINT(1) DEFAULT 1,
                          FOREIGN KEY (uid) REFERENCES app_user(uid),
                          FOREIGN KEY (user_schedule_id) REFERENCES user_schedule(id)
);