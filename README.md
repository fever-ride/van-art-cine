# The Cinephile's Van: Vancouver Independent Cinema Explorer

https://www.cinephilesvan.com

## 1. Overview

**The Cinephile's Van** is a full-stack web application that aggregates screening information from independent cinemas across Vancouver. Users can browse upcoming screenings, view film details, and manage a personal watchlist.

The platform integrates:

- **Python + Playwright scrapers** to collect raw screening data.
- **Custom data-processing pipeline** for cleaning, normalization, and deduplication, supplemented by the ChatGPT API for ambiguous fields that cannot be fully resolved programmatically.
- **External film-metadata APIs** to enhance data consistency and enrich each film with additional details.
- **PostgreSQL schema** to model films, screenings, cinemas, and ingestion layers with clear relationships and strong referential integrity.
- **Node.js/Express backend** with REST APIs, JWT authentication, and Prisma ORM for structured database access.
- **Next.js/React frontend** implementing dynamic filters, sorting, pagination, and personalized watchlist management.
- **Responsive UI** built with Tailwind CSS.

## 2. Project Structure

```text
project-root/
│
├── backend/             # Node.js + Express API
│   ├── prisma/          # Prisma schema, migrations, seed
│   └── src/             # Routes, controllers, services, middleware
│
├── frontend/            # Next.js client application
│
├── scrapers/            # Python + Playwright scraping scripts
│
├── data/                # Raw scraped HTML and cached responses
│
└── database/            # Data enrichment + ETL pipeline scripts
```

## 3. Backend Architecture (Key Files)

```text
backend/
├── src/
│   ├── routes/              # API endpoints
│   │   ├── auth.routes.ts
│   │   ├── screening.routes.ts
│   │   ├── user.routes.ts
│   │   └── watchlist.routes.ts
│   │
│   ├── controllers/         # Request handling + response formatting
│   │   ├── auth.controller.ts
│   │   ├── screening.controller.ts
│   │   ├── user.controller.ts
│   │   └── watchlist.controller.ts
│   │
│   ├── services/            # Business logic
│   │   ├── auth.service.ts
│   │   ├── screening.service.ts
│   │   ├── user.service.ts
│   │   └── watchlist.service.ts
│   │
│   ├── repositories/        # Prisma queries and DB operations
│   │   ├── screening.repo.ts
│   │   ├── film.repo.ts
│   │   └── user.repo.ts
│   │
│   ├── middleware/          # Auth, validation, error handling
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   │
│   ├── utils/               # Shared helpers (date parsing, normalization, etc.)
│   │   └── ...
│   │
│   └── app.ts               # Express app initialization
│
└── prisma/
    ├── schema.prisma        # Database schema
    ├── migrations/          # Migration snapshots
    └── seed.ts              # DB seed script
```

## 4. Data Model (Prisma)

### Core Models

- **app_user** — Registered users (email, hashed password, optional display name).
- **cinema** — Cinema metadata (name, website, address).
- **film** — Title, year, synopsis, languages, ratings, external IDs.
- **screening** — Individual showtimes linked to a film and a cinema.
- **watchlist_screening** — Join table linking `app_user` → saved screenings (the user's watchlist).
- **refresh_token** — Refresh tokens for long-lived sessions and secure token rotation.

### Ingestion / Supporting Models

- **raw_import** — Raw scraped payloads from source sites.
- **stg_screening** — Staging table for screenings before they are normalized.
- **ops_ingest_run** — Tracks ingestion runs, errors, and operational metadata.

## 5. Backend API Overview

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET  /auth/me`

### Films & Cinemas

- `GET /cinemas`
- `GET /films/:id`

### Screenings

- `GET  /screenings` — filtering, sorting, pagination
- `POST /screenings/bulk` — used by guest watchlist

### User (Auth required)

- `GET   /user/me` — get user profile
- `PATCH /user/me` — update profile
- `PATCH /user/me/password` — change password

### Watchlist (Auth required)

- `GET    /watchlist`
- `POST   /watchlist`
- `DELETE /watchlist/:id`
- `GET    /watchlist/status`
- `POST   /watchlist/toggle`
- `POST   /watchlist/import`

---

## 6. Frontend Features

### Homepage

- Lists all upcoming screenings across cinemas.
- Search by film title.
- Filter by cinema.
- Date or date-range filtering.
- Sorting by IMDb rating, screening time, runtime, etc.

Expandable panels for each screening include:

- Film description.
- Runtime.
- External links (cinema website, IMDb).
- Add/remove screening to/from watchlist.

### Film Detail Page

- Poster, metadata, genres, ratings.
- Full film description and additional info.
- List of all upcoming screenings for that film.
- Add-to-watchlist buttons.

### Watchlist Page

- Displays saved screenings.
- Shows status: Upcoming / Past / Inactive / Missing.
- “Get Tickets” external link.
- Remove with confirmation.
- Fully supports guest users + login migration.

### My Profile

- View email and membership date.
- Edit profile display name.
- Change password.
- Delete account.

### Other Pages

- Register / Login.
- About page describing the project.
