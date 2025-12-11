The Cinephile's Van: Vancouver Indie Film Screening Aggregator
(https://www.cinephilesvan.com)

1. Overview

The Cinephile's Van is a full-stack web application that aggregates screening information from independent cinemas across Vancouver. Users can browse upcoming screenings, view film details, and manage a personal watchlist.

The platform integrates:

- Python + Playwright web scrapers to collect raw screening data.
- Custom data processing pipeline with Python-driven cleaning, normalization, and deduplication logic, supplemented by ChatGPT API for the few ambiguous fields that cannot be resolved programmatically.
- External film-metadata API integrations to enhance data consistency, and enrich each film with additional details.
- PostgreSQL schema designed to model films, screenings, cinemas, and related film metadata with clear relationships and strong referential integrity.
- Node.js/Express backend with REST APIs, JWT authentication, and Prisma ORM for structured database access.
- Next.js/React frontend implementing dynamic filters, sorting, pagination, and personalized watchlist management.
- Responsive UI built with Tailwind CSS.

2. Project Structure

project-root/
│
├── backend/ # Node.js + Express API
│ ├── prisma/ # Prisma schema, migrations, seed
│ └── src/ # Routes, controllers, models, middleware
│
├── frontend/ # Next.js client application
│
├── scrapers/ # Data collection scripts
│
├── data/ # Raw data from website and cache for scrapers
│
└── database/ # Data enrichment + ETL pipeline scripts

3. Data Model (Prisma)

Core Models:

- app_user: Registered users (email, hashed password, optional display name).
- cinema: Cinema metadata (name, website, address).
- film: Title, year, synopsis, languages, ratings, external IDs.
- screening: Individual showtimes linked to a film and a cinema.
- watchlist_screening: Join table linking app_user → saved screenings (the user's watchlist).
- refresh_token: Refresh tokens for long-lived sessions and secure token rotation.

Ingestion / Supporting Models:

- raw_import: Raw scraped payloads from source sites.
- stg_screening: Staging table for screenings before they are normalized.
- ops_ingest_run: Tracks ingestion runs, errors, and operational metadata.

4. Backend API Overview

Auth
• POST /auth/register
• POST /auth/login
• POST /auth/refresh
• POST /auth/logout
• GET /auth/me

Films & Cinemas
• GET /cinemas
• GET /films/:id

Screenings
• GET /screenings — filtering, sorting, pagination
• POST /screenings/bulk — used by guest watchlist

User (Auth required)
• GET user/me - get user profile
• PATCH user/me - change user profile
• PATCH user/me/password - change user password

Watchlist (Auth required)
• GET /watchlist
• POST /watchlist
• DELETE /watchlist/:id
• GET /watchlist/status
• POST /watchlist/toggle
• POST /watchlist/import

5. Frontend Features

Homepage
• Lists all upcoming screenings across cinemas

Supports:
• Search by film title
• Filter by cinema
• Date or date-range filtering
• Sorting by IMDb rating, screening time, runtime, etc.

Expandable panels showing:
• Film description
• Runtime
• External links (cinema website, IMDb)
• Add/remove screenings to watchlist

Film Detail Page
• Poster, metadata, genres, ratings
• Film description and additional info
• List of all upcoming screenings for that film
• Add-to-watchlist buttons

Watchlist Page
• Displays saved screenings
• Shows status: Upcoming / Past / Inactive / Missing
• “Get Tickets” link
• Remove with confirmation
• Fully supports guest users + login migration

My Profile
• View email, membership date
• Edit profile name
• Change password
• Delete account

Other Pages
• Register/Login
• About page describing the project
