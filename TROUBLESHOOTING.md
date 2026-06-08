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
