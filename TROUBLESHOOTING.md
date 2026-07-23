# Troubleshooting Notes

## Production film page failed after data load

### Symptom

Film detail pages failed in production with a Server Components render error.

Browser console showed:

```text
An error occurred in the Server Components render.
```

Vercel logs showed:

```text
TypeError: fetch failed
cause: Error: certificate has expired
code: CERT_HAS_EXPIRED
```

### Cause

The SSL certificate for `api.cinephilesvan.com` had expired.

The data load was not the root cause. The API data was valid, but the Next.js server render could not fetch the backend API because Node.js rejected the expired certificate.

### Fix

On the EC2 instance:

```bash
sudo certbot certificates
sudo certbot renew
sudo systemctl reload nginx
```

Verify:

```bash
curl -Iv https://api.cinephilesvan.com/api/films/862
```

### Prevention

Enable the certbot renewal timer:

```bash
sudo systemctl enable --now certbot-renew.timer
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

Recommended follow-up:

- Add SSL expiry monitoring for `https://api.cinephilesvan.com/readyz`.
- Confirm nginx reloads after renewal.
- Check Vercel logs when production Server Components hide the real error.

---

## Homepage scroll jumps (search, Apply, pagination, date picker)

A multi-act debugging story on the Now Playing page. Three different user actions needed three different scroll strategies — treating them as one problem led to fixes that solved one case and broke another.

### Desired behavior (the spec we converged on)

| Action | Scroll |
|--------|--------|
| Search (debounced) | Stay in place if viewing the upper part of the table; if viewing removed lower rows after results shrink, land on table top — **not** the page footer |
| Apply, Reset, date pick | Same as search — no surprise jumps |
| Prev / Next pagination | Scroll to top of screening table (`#screenings-results`) |

---

### Act 1 — “Why does search fling me to the top?”

**Symptom:** User scrolls down to Now Playing, types in the left search box, and every ~350ms debounce the page snaps back to the hero section.

**Root cause:** Debounced search called `onApply()` → `goToPage(1)` → `router.push(url)`. Next.js App Router defaults to `scroll: true`, so even a same-page URL update resets scroll to the top.

**Fix:** `router.push(url, { scroll: false })`, skip `push` when URL is unchanged, and remove `onApply()` from the debounced search path (search only calls `setUI({ q })`).

**Lesson:** The bug looked like “search is broken” but was really “routing side effect.” Always check whether `router.push` is doing scroll restoration you didn’t ask for.

---

### Act 2 — Pagination jiggle, Apply flashes, and the loading overlay trap

**Symptoms:**

- Prev/Next only twitched instead of scrolling to the table.
- Apply / date filter sometimes jumped to the **middle** or **bottom** of the page.
- A loading line above the table made the header and Apply button flash.

**Root causes:**

1. `scrollIntoView({ smooth })` on pagination was cancelled by the re-render from `router.push`.
2. Loading UI above the table changed layout height mid-fetch.
3. Apply sits at the bottom of the filter card — focus-after-click can scroll it into view.
4. Table wrapper briefly unmounted when empty → height collapse.

**What we tried:**

| Attempt | Result |
|---------|--------|
| `scroll: false` on `router.push` | Fixed search-to-top; pagination still flaky |
| Scroll after `loading === false` | Too late; layout already shifted |
| `scrollIntoView({ smooth })` on pagination | Cancelled by route re-render → jiggle |
| Loading overlay on table | Pagination OK-ish; Apply/header flashed |
| Global `scrollSnapshot` on every filter change | Typing felt “乱跳”; Apply still jumped |
| `overflow-anchor: none` + `blur()` on buttons | Helped; didn’t solve Apply/search shrink |

**Fixes that stuck:**

- Pagination: `scrollToTableTop()` with `behavior: 'auto'`, then `requestAnimationFrame(() => goToPage())`.
- `tableRef` on `#screenings-results`, `scroll-mt-28` (7rem) for sticky nav clearance.
- Table wrapper always rendered; old rows stay visible until new data arrives (no loading overlay on the table).
- Apply/Reset buttons `blur()` on click.

---

### Act 3 — “`the long`”: the search that only broke on the second word

**Symptom:** Typing `the` felt fine. Finishing `the long` (debounce fires, results collapse from ~20 rows to 2) caused a sudden jump — often to the **page footer**.

**Why the first word felt fine:** Debounce hadn’t fired yet, or the filtered set was still tall enough that layout barely changed.

**Why the second word broke:** Refetch returned far fewer rows → the results column and flex row shrank → `document` height dropped while `window.scrollY` still pointed at coordinates that used to be deep inside the old table.

**The misleading fix — scroll position lock:** We extended the Apply “scroll lock” (capture `scrollY`, guard `scroll` events during loading, restore in `useLayoutEffect`) to debounced search. **It felt worse than the previous version** — the guard fought the browser and produced visible jitter. Forcing `scrollY` back on every scroll event is the wrong tool for layout-collapse bugs.

---

### Act 4 — The “upper half vs lower half” clue (the breakthrough)

**User observation:** If the viewport showed the **upper half** of the screenings table while searching, no jitter. If the viewport showed the **lower half**, search sent them to the **bottom of the page**.

**Interpretation:**

```
Before search (20 rows):          After search (2 rows):
┌─────────────────────┐           ┌─────────────────────┐
│  filters (sticky)   │           │  filters (sticky)   │
│                     │           │                     │
│  row 1              │           │  row 1              │
│  row 2   ← viewport │           │  row 2              │
│  ...                │           │  (end of table)     │
│  row 15             │           │                     │
│  row 16  ← scrollY  │           │  ← scrollY still    │
│  ...                │           │     points here     │
│  pagination         │           │     (empty / footer)│
└─────────────────────┘           └─────────────────────┘
```

- **Upper half:** `scrollY` still lies within the new short table → browser has valid content under the viewport → stable.
- **Lower half:** `scrollY` points past the new table bottom → browser clamps to `maxScroll` → viewport lands on footer / pagination area → feels like “jumped to page bottom.”

This is a **layout-collapse + stale scroll coordinate** problem, not a routing problem.

---

### Final fix (current)

**Strategy:** Three separate scroll behaviors + layout hold + table-relative settle after refetch. No `scroll` event guards.

**Files:**

- `frontend/app/page.tsx` — routing, layout hold, settle logic, pagination scroll
- `frontend/components/screenings/Filters.tsx` — debounced search without `onApply`
- `frontend/components/screenings/Pagination.tsx` — button `blur()`
- `frontend/components/screenings/ScreeningDateInput.tsx` — portaled date picker
- `frontend/app/lib/formatDate.ts` — `todayYmdInDisplayTimezone`

#### 1. Routing / search

- `goToPage()`: `router.push(url, { scroll: false })`, early return if URL unchanged.
- Debounced search: `setUI({ q })` only — not `onApply()`.
- `filterKey` `useEffect`: reset to page 1 when filters change and `page > 1` (skips initial mount so `?page=2` deep links work).

#### 2. Layout hold while refetching

On `filterKey` change (debounced search) or Apply/Reset (`onApply` → `captureRowHeight()`):

- Record `contentRowRef.offsetHeight` → `rowMinHeight` on the Now Playing flex row.
- Keeps the row from collapsing **during** the fetch while old rows are still painted.

#### 3. Settle scroll after refetch (`settleScrollAfterRefetch`)

When loading finishes, in `useLayoutEffect`:

1. Release `rowMinHeight`.
2. Measure the **new** table height.
3. If `scrollY > tableTop + newTableHeight` → user was in the old table’s lower rows → `scrollTo(tableTop - 7rem)` (matches `scroll-mt-28`), **not** leave them at the footer.
4. Else if `scrollY > maxScroll` → clamp to document bottom.

#### 4. Pagination (unchanged intent)

- `handlePageChange` → `scrollToTableTop()` → `requestAnimationFrame(() => goToPage())`.
- `scrollIntoView({ behavior: 'auto', block: 'start' })` on `#screenings-results`.

#### 5. Layout stability helpers

- Table wrapper always mounted; empty state inside.
- No loading overlay replacing table rows.
- `[overflow-anchor: none]` on results layout and table.

#### 6. Date picker (parallel UX fix)

- Replaced native `<input type="date">` with `ScreeningDateInput` (`react-day-picker`).
- `min` = today in `America/Vancouver`.
- Popover portaled to `document.body` (filter `Card` has `overflow-hidden`).
- `showOutsideDays={false}`.

### Key code references (current)

```ts
// Filters.tsx — search does not call onApply
debounceRef.current = setTimeout(() => {
  setUI({ q: value });
}, 350);

// Apply / Reset — capture row height before commit
onClick={(e) => {
  onApply();       // page.tsx → captureRowHeight()
  commitApply();   // setUI(...)
  e.currentTarget.blur();
}}

// page.tsx — layout hold
const captureRowHeight = () => {
  const el = contentRowRef.current;
  if (el?.offsetHeight) setRowMinHeight(el.offsetHeight);
};

// filterKey change or Apply → captureRowHeight()
useEffect(() => { /* on filterKey change */ captureRowHeight(); }, [filterKey, page]);

// After refetch completes
useLayoutEffect(() => {
  if (screeningsData.loading || rowMinHeight === undefined) return;
  setRowMinHeight(undefined);
  settleScrollAfterRefetch();
}, [screeningsData.loading, screeningsData.items, rowMinHeight]);

const settleScrollAfterRefetch = () => {
  const tableTop = table.getBoundingClientRect().top + window.scrollY;
  const newTableHeight = table.offsetHeight;
  if (window.scrollY > tableTop + newTableHeight) {
    window.scrollTo({ top: tableTop - TABLE_SCROLL_MARGIN, behavior: 'instant' });
  } else if (window.scrollY > maxScroll) {
    window.scrollTo({ top: maxScroll, behavior: 'instant' });
  }
};

// Pagination — intentional scroll to table
const handlePageChange = (nextPage: number) => {
  scrollToTableTop();
  requestAnimationFrame(() => goToPage(nextPage));
};
```

### Prevention / lessons (for the next person)

1. **One scroll strategy per user intent** — search (stay/settle), Apply (stay/settle), pagination (go to table). Do not share a single `scrollY` lock across all three.
2. **`router.push` on homepage** → `{ scroll: false }` unless you explicitly want top-of-page navigation.
3. **Layout collapse ≠ scroll restoration** — when result count drops, fix layout height and/or adjust scroll relative to the **table**, not absolute `scrollY` guards.
4. **Do not use `scroll` event guards for search** — fighting the browser feels worse than the original bug.
5. **Reproduce with viewport position** — “upper half vs lower half of the table” was the key reproducer; always test search while scrolled into the bottom rows.
6. **Portaled popovers** inside `Card` / `overflow-hidden`.
7. **Past dates in DB** (`is_active` not auto-cleared) is a separate backend issue; frontend blocks via picker `min` (pipeline fix still TBD).

### Quick verify

1. Scroll to Now Playing **upper table** → search `the long` → stays put; results update in place.
2. Scroll to Now Playing **lower table** (rows 15+) → search `the long` → lands on **table top**, not footer.
3. Select a date → Apply (and Reset) → no jump to bottom/middle.
4. Scroll to bottom of results → Next/Prev → lands on screening table top.
5. Date picker opens fully (not clipped); cannot pick dates before today (Vancouver).
6. Open `/?page=2`, refresh → still page 2.

---

## Data pipeline: `resolve_imdb_id_url` dies mid-run with "server closed the connection unexpectedly"

A backend/data-eng story: one Postgres transaction quietly grew to span an entire batch job's worth of unreliable external API calls, and the DB itself paid the price.

### Symptom

Running the enrichment pipeline (`database/scripts/run_all.py`, which chains `load_json → resolve_imdb_id_url → merge_duplicate_films → omdb_api → enrich_person_ids → merge_duplicate_persons → merge_staging_to_live`) produced a run log with three different failures in three different steps:

```text
Step: resolve_imdb_id_url
psycopg2.OperationalError: server closed the connection unexpectedly
  This probably means the server terminated abnormally
  before or while processing the request.
❌ Step resolve_imdb_id_url failed after 340.2s

Step: omdb_api
[OMDb] HTTP 401: {"Response":"False","Error":"Request limit reached!"}
[MISS] ... (repeats for every remaining film)

Step: enrich_person_ids
Searching: Fran&apos;s Assistant (id=482)
  ❌ Not found
```

Three symptoms, but they smelled related: something about how these scripts talk to slow/unreliable external services (TMDB, OMDb) while holding onto a database connection was fragile.

### Investigation

Read `resolve_imdb_id_url.py`'s `main()` as it stood before the fix:

```python
def main():
    conn = conn_open()
    try:
        films = ...  # SELECT hundreds of rows
        for film in films:
            ids = find_tmdb_and_imdb(film["title"], film["year"])  # slow TMDB call
            if ids and (ids["imdb_id"] or ids["tmdb_id"]):
                update_film_ids(conn, film["id"], ...)              # DB write, no commit
        conn.commit()   # <-- the ONLY commit, after the entire loop
    finally:
        conn.close()
```

Three things stood out immediately, all variations on the same root design flaw:

1. **The transaction's lifetime was coupled to the slowest, least predictable part of the program.** `conn` was opened once, and every `find_tmdb_and_imdb()` call in the loop — a network round-trip to TMDB, with its own retry/backoff sleeps — happened *while a transaction was open*. For ~900 films at a few hundred ms–several seconds each (more with rate-limit backoff), that's a transaction held open for minutes, doing nothing DB-related for the vast majority of that time.
2. **One `commit()` for the whole run.** If anything threw partway through film #500 of 900, none of the previous 499 successful lookups were persisted — the DB rolls back (or the connection just dies) and the run has to start over from zero.
3. **No retry/backoff around the TMDB calls themselves.** A single 429 (rate limited) or a transient 5xx/timeout just logged an error and returned `None` — no attempt to wait and retry before giving up on that film.

That reframed the "server closed the connection unexpectedly" error: it's very likely Render's managed Postgres (or a proxy in front of it) closing a connection that had been sitting idle-in-transaction for an unusually long time while the script was off talking to TMDB — the DB was being asked to babysit a transaction for a duration it was never designed to tolerate.

### Fix

**Decouple the transaction from the network call, and commit incrementally.** The TMDB lookup for a film now happens entirely *before* any DB cursor is opened for that film; the DB write (a couple of `UPDATE`s) is wrapped in its own short-lived commit immediately after:

```python
for film in films:
    ids = find_tmdb_and_imdb(film["title"], film["year"])  # network call, no txn open
    for attempt in range(2):
        try:
            update_film_ids(conn, film["id"], ids["imdb_id"], ids["tmdb_id"], ids["poster_path"])
            conn.commit()                      # commit per film, not per run
            break
        except psycopg2.OperationalError as e: # connection was dropped anyway — reconnect once
            conn = reconnect(conn)
            reconnects += 1
```

This buys three things at once: the transaction is now always short and DB-only (removing the root cause of the idle-in-transaction disconnect), a crash mid-run only loses the *current* row instead of the whole batch, and — belt-and-suspenders — if the connection still gets killed for some other reason, we reconnect and retry that one row instead of crashing the script.

**Added retry/backoff for the external calls themselves** (`database/scripts/http_retry.py`, shared by the TMDB and OMDb call sites): exponential backoff on `429`/`5xx`/network exceptions, honoring `Retry-After` when present, before giving up on a single request.

**Taught the OMDb step to recognize "there is no point retrying" vs. "worth retrying."** OMDb's daily-quota-exhausted response (`HTTP 401` + `"Request limit reached!"`) is not a transient error — retrying it, or even continuing to the next film, just burns more guaranteed-401 requests. The fix raises a dedicated `OmdbQuotaExceeded` exception that stops the run immediately with a clear message, instead of looping through every remaining film logging identical misses.

### Bonus findings (surfaced while hardening, not the original ask)

Fixing the commit strategy meant re-reading and testing this code path closely, which surfaced two more pre-existing, unrelated bugs:

- **HTML entities leaking into stored/searched text.** OMDb returns fields like `Genre`, `Plot`, and person names with HTML entities un-decoded (`Fran&apos;s Assistant` instead of `Fran's Assistant`). That log line above (`enrich_person_ids` failing to find "Fran&apos;s Assistant" on TMDB) wasn't a TMDB matching problem — TMDB was being asked to search for a string containing literal HTML markup. Fixed by running `html.unescape()` on every OMDb text field before it's stored or used in a downstream search.
- **`"N/A"` being stored as if it were a real person.** OMDb returns the literal string `"N/A"` (not an empty field) when a film has no director/writer/cast on record. The pipeline had been splitting that string on commas and `upsert_person()`-ing the result — so a "person" named `N/A` had quietly accumulated **146** director/writer/cast links across the catalog. Found this by writing a quick synthetic-input test for the refactored write path (no real API call needed) — it immediately produced an `N/A` row in the results. Fixed the filter, then cleaned up the historical pollution.

**Also fixed the "hitting the quota wall makes zero forward progress" problem.** The OMDb step re-fetched *every* film on *every* run, with no memory of which films had already been enriched. So hitting the daily quota limit meant the next run would start over from film #1 and hit the same wall at roughly the same point — never making net progress. Added an `omdb_synced_at` timestamp column (`database/migrations/2026-07-21_add_omdb_synced_at_to_film.sql`) and made the default query only select films where it `IS NULL`, stamping it on a successful write *and* on a definitive "OMDb has no record of this title" response (both are real answers that don't need re-querying) — but deliberately leaving it untouched on a transient failure, so that film stays eligible for retry on the next run. A `--all` flag preserves the old "re-fetch everything" behavior for deliberate full refreshes.

### Prevention / lessons

1. **A database transaction's lifetime should never be coupled to an external network call's lifetime.** If a loop body does "slow, unreliable I/O" + "DB write", do the I/O first, then open/commit/close the DB work as its own short unit — for every iteration, not just once for the whole loop.
2. **Any batch job calling third-party APIs should commit incrementally**, and be written assuming it *will* die partway through eventually (rate limits, network blips, the process getting killed) — so restarting doesn't mean redoing everything from zero.
3. **Not all failures deserve a retry.** Distinguish "worth retrying" (429, 5xx, timeouts) from "worth aborting the whole run immediately" (a definitive quota-exhausted response — retrying just wastes more calls) from "a legitimate negative result" (HTTP 200 but no data) that should be recorded so it isn't retried forever either.
4. **A small synthetic-input test for a refactored code path is worth writing even when you can't hit the real API** (ours was rate-limited at the time) — it caught a completely unrelated, months-old data-quality bug in the first run.
5. **Incremental/idempotent design pays for itself the first time a long job fails partway through.** The existing TMDB step already cached lookups to a local JSON file for this reason; extending the same "remember what's already done" idea to the OMDb step (via `omdb_synced_at`) closed the same gap there.

### Key code references

- `database/scripts/http_retry.py` — shared retry/backoff for TMDB + OMDb requests
- `database/scripts/db_helper.py` — `reconnect()`, `fetch_films_needing_omdb()`
- `database/scripts/resolve_imdb_id_url.py` — `main()` per-row commit + reconnect
- `database/scripts/omdb_api.py` — `OmdbQuotaExceeded`, `_write_with_reconnect()`, `_clean_text()` (HTML unescape), N/A filter, `--all` flag
- `database/migrations/2026-07-21_add_omdb_synced_at_to_film.sql`

### Quick verify

1. `python omdb_api.py` on an already-fully-enriched catalog → "Fetching OMDb data for 0 film(s)" — no wasted requests.
2. `python omdb_api.py --all` → re-fetches every film regardless of `omdb_synced_at`.
3. Kill/rate-limit the network mid-run → previously-processed rows stay committed; re-running only touches the remaining films.
4. `SELECT name FROM person WHERE name = 'N/A'` → no rows.
5. A film with `&apos;`/`&eacute;`-style entities in its OMDb `Plot`/person names → stored and displayed decoded, not as raw markup.
