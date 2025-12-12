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
│   ├── prisma/          # Prisma schema
│   └── src/             # Routes, controllers, services, models, middleware
│
├── data/                # Raw scraped data and cached responses
│
├── database/            # Data enrichment + ETL pipeline scripts
│
├── frontend/            # Next.js client application
│
├── scrapers/            # Python + Playwright scraping scripts
│
└── tools/               # Developer utilities and test helpers
```

## 3. Backend Architecture (Key Files)

```text
backend/
├── src/
│   ├── routes/              # API endpoints
│   │   ├── auth.js
│   │   ├── cinemas.js
│   │   ├── films.js
│   │   ├── screenings.js
│   │   ├── user.js
│   │   └── watchlist.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   └── watchlistController.js
│   │
│   ├── services/
│   │   ├── authService.js
│   │   ├── userService.js
│   │   └── watchlistService.js
│   │
│   ├── models/
│   │   ├── cinemas.js
│   │   ├── films.js
│   │   ├── screenings.js
│   │   ├── userModel.js
│   │   └── watchlistModel.js
│   │
│   ├── middleware/
│   │   └── auth.js
│   │
│   ├── validators/
│   │   ├── authValidators.js
│   │   ├── userValidators.js
│   │   └── watchlistValidators.js
│   │
│   ├── utils/
│   │   └── ...
│   │
│   ├── lib/
│   │   └── ...
│   │
│   ├── db.js
│   └── server.js
│
└── prisma/
    ├── schema.prisma        # Database schema
    ├── migrations/
    └── seed.ts
```

## 4. Frontend Architecture (Key Files)

```text
frontend/
├── app/                     # Next.js App Router (pages, routes, server actions)
│   ├── about/               # About page
│   ├── auth/                # Login + Register pages
│   ├── films/               # Film detail pages (/films/[id])
│   ├── lib/                 # Client-side helpers (API wrappers, utilities)
│   ├── profile/             # User profile page
│   ├── watchlist/           # Watchlist page
│   ├── favicon.ico
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout (fonts, providers, navigation)
│   └── page.tsx             # Homepage (screenings listing + filters)
│
├── components/              # Reusable UI components
│   ├── films/               # Components for film detail pages
│   │   ├── FilmHeader.tsx   # Poster + title block
│   │   ├── FilmMeta.tsx     # Metadata (cast, description, ...)
│   │   └── FilmShowtimes.tsx# Upcoming screenings list for a film
│   │
│   ├── screenings/          # Components for homepage screening listings
│   │   ├── Filters.tsx      # Search bar, cinemas, date filters
│   │   ├── Pagination.tsx   # Pagination controls
│   │   └── ResultsTable.tsx # Screening listing
│   │
│   ├── watchlist/           # Watchlist-related UI
│   │   └── WatchlistButton.tsx
│   │
│   └── NavBar.tsx           # Global navigation bar
│
├── lib/                     # Non-React utilities and helpers
│   ├── hooks/               # Custom React hooks
│   │   ├── useScreeningsData.ts
│   │   ├── useScreeningsUI.ts
│   │   └── useWatchlist.ts
│   └── ...
│
├── public/                  # Static files (images, icons)
│
├── tests/
│
└── package.json
```

## 5. Data Model (Prisma)

### Core Models

- **app_user** — User accounts, authentication info, and related records.
- **cinema** — Cinema metadata such as name, website, and address.
- **film** — Film titles and enriched metadata (ratings, cast, external IDs).
- **person** — People associated with films (directors, writers, cast).
- **film_person** — Join table linking films and people with a role.
- **screening** — Final normalized showtimes linked to film + cinema.
- **watchlist_screening** — Records of screenings saved by users.
- **refresh_token** — Session storage and token rotation.

### Ingestion-related models:

- **raw_import** — Raw scraped payloads before processing.
- **stg_screening** — Staging area for processed screening data before merge.
- **ops_ingest_run** — Metadata for each ingestion pipeline run.
- **custom_event** — Generic event logging for user actions.
- **user_schedule** — (Unused) placeholder for potential schedule features.

## 6. Backend API Overview

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

## 7. Frontend Features

### Homepage

- Lists all upcoming screenings with key details, a source link, and relevant external references.
- Search by film title.
- Filter by cinema.
- Date or date-range filtering.
- Sorting by ratings, screening time, etc.
- Add-to-watchlist buttons.

### Film Detail Page

- Poster and additional info.
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
