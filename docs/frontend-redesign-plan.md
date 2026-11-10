# Frontend Redesign Plan

Status: Draft · 2026-11-08
Scope: `frontend/` (Next.js 15 App Router, React 19, Tailwind v4)
Design references: `docs/design-refs/*.html`

This plan has four phases. Phases 1–3 cover visuals and mobile. Phase 4 is the state layer and can run in parallel with them. Each phase can ship on its own.

---

## Current State Summary

### Visual
- **Fonts are inconsistent.** Five font families are loaded, each inside individual modules:
  - Geist (`app/layout.tsx:8-16`)
  - Arial — `globals.css:93` sets `body` to it, which overrides Geist
  - Noto Sans, loaded separately in 7 files
  - Hanken Grotesk / Archivo (`ScreeningsFilterPanel.tsx`, `FilmListView.tsx`)
- **Tokens exist but are often bypassed.** `globals.css:3-88` defines them, but many places hard-code values instead:
  - `#F5C518` in `ResultsTable.tsx:227`
  - `bg-[#1a1a1a]` in `SignInDropdown.tsx:58`
  - `slate-*` / `gray-*` classes
  - pixel font sizes such as `text-[14px]`
- **No dark mode.**
- **Large radii** (up to 12px) and a generic SaaS look, while the references lean on editorial typography.

### Responsive
- **The Showtimes table (`ResultsTable.tsx`) has no mobile layout.**
  - It is a 5-column table, and the Watchlist column has `min-w-[164px]`.
  - It scrolls sideways inside `overflow-x-auto` (`ScreeningsPageClient.tsx:304`).
- **Nav bar:** the outer container has no horizontal padding, and `NavBar.tsx:111` uses `-mx-4`. This can cause sideways scrolling.
- **Sign-in panel:** `SignInDropdown.tsx:56` uses `fixed top-[140px]`. If the header wraps on mobile, the panel is misplaced.
- **Table-view filters** are fully expanded above the results on mobile. Film view already has a bottom sheet.
- **Tap targets below 44px:**
  - expand button 28px
  - Watchlist button ~30px
  - checkboxes 14px
  - sheet close button 32px
- **Hard-coded header-height assumptions:** `scroll-mt-28`, `md:top-30`, `scrollMarginTop: '7rem'`.
- **Good example to follow:** `app/watchlist/page.tsx` already shows a table at `md+` and a stacked list below `md`.

### State
- **Filters, sort, page and view live in the URL** (`useScreeningsUI`, `screeningsUrlState.ts`), and the server renders from it. **Keep this.**
- **Auth state is checked separately in 3 places:** `NavBar.tsx:17-34`, `watchlist/page.tsx:68`, `profile/page.tsx:20`. Logging in from the nav bar does not update a page that is already open.
- **Watchlist has multiple sources of truth:**
  - the `useWatchlist` hook
  - each `WatchlistButton`'s own `saved` state
  - the `/watchlist` page's own separate state
- **Cinema and facet data** are fetched by hand with `useEffect` (`ScreeningsPageClient.tsx:187-231`) and are not cached.
- **`swr` is installed but unused.**
- **Bug:** `Filters.tsx`'s `useEffect([ui])` runs on every parent render, because `ui` is a new object each time. This can wipe filter edits the user has not yet applied.
- **Duplicated search debounce:** the 350ms debounce exists in both `Filters.tsx:69` and `ScreeningsFilterPanel.tsx:54-75`.

---

## Phase 1 — Design Tokens, Fonts (light theme) ✅

Decisions: accent = apricot `#F2A65A` (salmon `#e98f76` was dropped — too close to Claude clay `#D97757`); light theme only for now (dark mode deferred, see below).

- [x] Archivo (`wdth` axis) + Hanken Grotesk loaded once in `app/layout.tsx` via `next/font` (`--font-archivo` / `--font-hanken`); all per-module Noto/Archivo/Hanken loading removed; Arial override removed.
- [x] Tokens rewritten in `globals.css` (ink on white, `--rule`, small radii 2–4px). New tokens: `accent-ink` (text on salmon fills), `accent-strong` (salmon-family text on white — salmon itself fails contrast as text), `rule`, `imdb`, `rt`.
- [x] Typography: `font-display` utility (Archivo, `font-stretch: 112%`); `h1`/`h2` use it by default. Hero headline uses `clamp(36px, 6.1vw, 72px)`, uppercase.
- [x] Hard-coded colours replaced: `#F5C518`→`bg-imdb`, `#FA320A`→`bg-rt`, `#1a1a1a`→`bg-hero-bg`, `gray-*`/`slate-*`/`amber-*` → tokens or `white/x`.
- [x] Nav bar: shadow removed, black hairline rule. `app/page.tsx.backup` removed.
- [x] Pixel font sizes (`text-[14px]` etc.) → type scale. Done in Phase 3 for Showtimes + watchlist lists: `@theme` tokens `text-micro` 10 / `text-label` 11 / `text-meta` 13 / `text-time` 17, plus built-in `text-sm` 14 / `text-base` 16 / `text-xl` 20 (computed sizes verified unchanged). Film-view files (`FilmListView`, `ScreeningsFilterPanel`) still use `text-[Npx]` — left alone per the Phase 3 scope decision; convert when Film view is next touched.

### Deferred: dark mode (requirement recorded)
- Tokens are the only place colours live, so dark mode = redefining `:root` values under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, plus `:root[data-theme="dark"]`.
- Reference dark palette (FLC refs): bg `#101010`, ink `#f3f3f3`, ink-soft `#d8d8d8`, muted `#9a9a9a`, rule `#f3f3f3`, panel `#1a1a1a`; salmon accent unchanged, `accent-strong` must be re-picked for dark bg.
- Open question: follow system only, or also a manual toggle in the nav bar.
- Prerequisite: remaining `text-white` / `bg-white/10` in the hero and auth panels should become tokens first.

## Phase 2 — Mobile Fundamentals ✅

Verified at 375 / 768 / 1024 / 1280: `scrollWidth === innerWidth` (no sideways scroll) in both views.

- [x] NavBar: `px-4 md:px-6`; removed the `-mx-4` row that widened the page by 16px; row 1 never wraps (tagline hidden and "Create account" → "Join" below `sm`); nav pills ≥40px tall.
- [x] Sign-in panel: portaled to `<body>` (the header's `backdrop-filter` made it the containing block for `position: fixed`, which is why the panel used a magic `top-[140px]`); now a scrollable overlay. Close buttons 44px in both auth dialogs.
- [x] Search split out of the filter UIs into one shared `SearchBar` above both views (instant, debounced). Sidebar/sheet filters are Apply-only and no longer touch `q`. The duplicated 350ms debounce is gone (`components/screenings/SearchBar.tsx`, tests in `tests/components/SearchBar.test.jsx`).
- [x] Search and filters are independent at the state layer, not just visually: `useScreeningsUI` exposes one writer per owner — `setSearch` (only `q`, replace), `setFilters` (never `q`/`view`, push), `setView` — each with its own `useTransition`, so `pending.search` / `pending.filters` / `pending.view` never cross-talk (`pending.any` for page-level layout holding). The old catch-all `setUI` / shared `isPending` is gone.
- [x] Showtimes filters below `lg` (phones *and* tablets): "Filters (n)" button → bottom sheet (reuses `MobileFilterSheet`, now exported with an optional footer). Sheet closes on Apply/Reset. Sidebar only from `lg` (1024px) — at 768px it squeezed the table to ~430px.
- [x] Results column `min-w-0` so the table scrolls inside its card instead of widening the page.
- [x] Tap targets: cinema rows / radios ≥44px below `lg`, checkboxes 16px, Watchlist button ≥40px, view toggle ≥40px, film-view Filter button 44px, table expand button 40px.
- [x] `--header-h` published by NavBar (ResizeObserver) + `--scroll-offset`; replaced `scroll-mt-28`, `7rem`, `md:top-30`, `7.5rem` and the JS `TABLE_SCROLL_MARGIN = 112`.
- [x] Showtime hydration mismatch (12:30 vs 1:30 PM) — root cause was BC's permanent UTC-7 + stale tzdata in Node; fixed in all layers. See TROUBLESHOOTING.md → "Showtimes off by one hour".
- [ ] Moved to Phase 3: fixed poster sizes (`FilmListView.tsx`, `FilmHeader.tsx`) and the table details panel padding — both components are redesigned there anyway.

## Phase 3 — Cards and View Redesign

> **Scope decision (2026-11-08):** Film view's visuals stay as they are (it was built recently). Phase 3 focuses on **Showtimes**: mobile cards below `md`, restyled desktop table, the deferred poster/detail-panel sizing, and pixel font sizes → type scale. The Film-view items below are parked.


- [ ] **Film view (decide whether it becomes the default):** follow the reference `.film` layout.
  - poster on the left, 2:3
  - on the right: title (Archivo), director · year · runtime, genre tags
  - below: showtime pills ("venue + time"), each linking to tickets
  - one column on mobile; poster can be shrunk or placed above
- [x] **Showtimes view → adaptive list** (`components/screenings/ScreeningList.tsx`, replaces the deleted `ResultsTable.tsx`; tests in `tests/components/ScreeningList.test.jsx`):
  - One CSS-grid markup per screening: card below `md` (time column left; title, cinema, actions stacked right), aligned columns from `md` (When · Film · Cinema · Watchlist · chevron). No sideways scroll at 375 / 768 / 1280.
  - Information unchanged, row and expanded details alike.
  - Expand kept: click anywhere on the row/card (except links/buttons), the chevron on desktop or "Details ›" on mobile. Toggles carry `aria-expanded`/`aria-controls`.
  - Long titles and cinema names wrap inside their column (never truncated).
- [x] Watchlist page aligned with the homepage list. Its rows carry different data (status, IMDb score, "Get tickets", confirm-before-remove, no details), so it is its own `components/watchlist/WatchlistList.tsx` built from shared cells in `components/screenings/ScreeningRowParts.tsx` (`ScreeningWhen`, `FilmTitle`, `ListHeader`, `Chevron`, frame/row classes) — the same parts `ScreeningList` now uses. The old duplicated `<table>` + mobile `<ul>` (two copies of every row) is gone. Layout: card below `md`; at `md` four columns with the buttons on a second line (five columns squeezed titles to one word per line at 768px); one line from `lg`. Fixed-width actions column so the header row stays aligned. Page shell now matches the homepage (`max-w-[1400px]`, Archivo uppercase heading, saved-count line). Information unchanged except the "Saved Screenings" band, replaced by the column header row and count. Tests in `tests/components/WatchlistList.test.jsx`.
- [x] View toggle → underline tabs (`components/screenings/ViewTabs.tsx`): current view = ink text + apricot bar, other = muted; no filled block, so it never reads as a button next to the apricot "Add to Watchlist". Two filled variants were tried and rejected (ink fill: unclear which half is selected; apricot fill: looks like the action button). The bar slides between tabs (0.3s, `motion-reduce` → jump) and moves optimistically on click, before the view navigation commits. `role="group"` + `aria-pressed`. Tests in `tests/components/ViewTabs.test.jsx`.
- [ ] Hero area: follow the reference "Now Showing in Vancouver" headline and short intro.
- [x] `prefers-reduced-motion` support (site-wide): slide-in panels (auth dropdown/modal, mobile filter sheet) fade instead; skeleton pulse stops; details chevron and view-tab bar jump instead of animating; poster hover zoom off. Colour/opacity transitions and the search spinner (only "working" signal) are kept. Central rules in `globals.css`, component-level via `motion-safe:` / `motion-reduce:`.

## Phase 4 — State Layer (Redux Toolkit)

### Why Redux Toolkit (RTK), and Can We Handle It?

Our state needs fall into three groups:

| State | Where it lives now | Target |
|---|---|---|
| Filters, sort, page, view | URL | **Stays in the URL** (SEO, shareable links, server rendering). Not moved into Redux. |
| Auth (`me`) | ~~Fetched separately in 3 places~~ → one `AuthProvider` + `useAuth()` (2026-11-09, fixes sign-in/out needing a refresh; TROUBLESHOOTING.md) | Optionally back `AuthProvider` with RTK Query `me`; consumers keep `useAuth()` unchanged |
| Watchlist | hook + button + page, 3 copies | RTK Query, with optimistic updates (UI changes first, then confirmed with the server) |
| Cinemas / facets | Hand-written `useEffect` | RTK Query cache |
| Guest watchlist | localStorage | Slice + sync to localStorage |
| UI state (sheet open, theme) | Component-local | Mostly stays local. Global items (theme) can go in a slice. |

**Conclusion:** the work that actually helps here is server-state caching. RTK Query covers it fully, so we use **RTK + RTK Query** and **do not also use SWR** (uninstall it).

**On whether we can handle it:**
- With RTK, boilerplate is far lighter than classic Redux. `createSlice` / `createApi` cover nearly everything.
- The main difficulty is integrating with the Next App Router:
  - Create **one store per request** (`makeStore()`), and provide it from a client `StoreProvider` (`useRef`). Never use a module-level singleton, or data leaks between users on the server.
  - Only client components can use `useSelector` and hooks. Server components keep fetching data directly, as `app/page.tsx` does now.
  - Server-rendered `initialItems` stay as props and are not put into the store, which avoids hydration complexity.
- Total scope is about 5–8 files. Migrate in small steps; each step can ship and roll back on its own.

### Steps

- [x] 4.0 Fix the `Filters.tsx` `useEffect([ui])` bug — now syncs by value on sidebar-owned fields only. See TROUBLESHOOTING.md → "Unapplied filter edits vanish". (Debounce merge moved to Phase 2 with the search-bar split.)
- [ ] 4.1 Add `@reduxjs/toolkit` and `react-redux`. Create:
  - `lib/store/store.ts` (`makeStore`)
  - `lib/store/hooks.ts` (typed `useAppDispatch` / `useAppSelector`)
  - `app/StoreProvider.tsx`
  - wrap the app in `layout.tsx`
- [ ] 4.2 `lib/store/api.ts`: `createApi` + `fetchBaseQuery` (with credentials). First endpoint: `getMe`.
  - Replace auth checks in NavBar, watchlist and profile.
  - Login/logout invalidate the `Me` tag.
- [ ] 4.3 Watchlist:
  - endpoints `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, with optimistic updates via `onQueryStarted`
  - `WatchlistButton` drops its internal `saved` state and reads from the cache
  - the `/watchlist` page uses the same data
  - guest mode: a slice plus localStorage; merge on login
- [ ] 4.4 Move `getCinemas` and `getFacets` into RTK Query. Remove the hand-written fetching in `ScreeningsPageClient`.
- [ ] 4.5 Uninstall `swr`. Add basic tests for slices and endpoints (Jest is already set up).
- [ ] 4.6 (Optional) theme slice, used with the Phase 1 dark mode toggle.

**Fallback:** if RTK integration turns out too costly, use the `AuthProvider` (Context) + SWR approach instead. It covers the same problems, with less code but a weaker ecosystem.

---

## Execution Order

1. Phase 1 → 2 → 3 run in order (they share many style files).
2. Phase 4.0 can be done right away. 4.1–4.5 can run in parallel with Phases 1–3. They overlap mainly in `WatchlistButton` and `ScreeningsPageClient`, so coordinate merges there.
3. Before each phase, create an OpenSpec change (`/opsx:propose`) to break the work into tasks.

## Open Decisions

- [x] Accent color — apricot `#F2A65A`
- [ ] Whether Film view becomes the default homepage view
- [ ] Dark mode: deferred; toggle vs. system-only still open
