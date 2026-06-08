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

## Homepage scroll jumps when searching or paginating

### Symptom

On the homepage (`frontend/app/page.tsx`), scrolling down to the **Now Playing** filters and typing in the search box caused the page to jump back to the top every few keystrokes (350ms debounce).

After an initial fix, new problems appeared:

- Pagination did not scroll to the screening table top (only a small “jiggle”).
- A loading overlay made the Apply button and table header flash.
- A later attempt to fix pagination made typing cause wild, repeated scroll jumps.

### Desired behavior

| Action | Scroll |
|--------|--------|
| Search (debounced), Apply, Reset | Stay at current scroll position |
| Prev / Next pagination | Scroll to top of screening table (`#screenings-results`) |

### Root causes

Several issues stacked on top of each other:

1. **Next.js default scroll on `router.push()`**  
   Filter search debounce called `onApply()` → `goToPage(1)` → `router.push(url)`.  
   App Router defaults to `scroll: true`, so even same-page query updates reset scroll to top.

2. **Filter reload changes layout height**  
   When `useScreeningsData` refetched, result count changed and the table container was conditionally unmounted (`items.length > 0`). The browser recalculated scroll position when content collapsed or grew.

3. **Pagination scroll fought with route updates**  
   `scrollIntoView({ behavior: 'smooth' })` started, then `router.push()` re-rendered and cancelled the animation (felt like a jiggle, not a real scroll).

4. **Loading UI shifted layout**  
   A full-table `Loading…` line above the table, then a semi-transparent overlay, pushed or dimmed the header on every refetch.

5. **Search debounce over-triggered page reset**  
   Debounced search called `onApply()` on every query change. Combined with scroll restoration experiments, this caused conflicting scroll logic on each keystroke.

### Investigation path (what we tried)

1. `router.push(url, { scroll: false })` + skip push when URL unchanged → fixed search jumping to top.
2. `useEffect` on `page` + `scrollIntoView` on results `<section>` → pagination scroll unreliable (wrong target, too early).
3. Ref on table + scroll after `loading === false` → still jiggled; loading text shifted layout mid-scroll.
4. Immediate `scrollIntoView` on pagination click + loading overlay to prevent layout shift → pagination worked, but Apply/header flashed.
5. Removed overlay; debounced search still called `onApply()`; table unmounted when empty → typing “乱跳” returned.

### Fix

**Files:** `frontend/app/page.tsx`, `frontend/components/screenings/Filters.tsx`, `frontend/components/screenings/Pagination.tsx`

1. **Keep `scroll: false` and skip no-op navigations** in `goToPage()`.

2. **Split filter vs pagination intent** with refs:
   - `loadIntentRef`: `'filter' | 'pagination'`
   - `scrollSnapshotRef`: saved `window.scrollY` before filter refetch
   - On filter change: snapshot scroll, reset to page 1 only if `page > 1`
   - After filter load: restore snapshot with `window.scrollTo({ behavior: 'auto' })`
   - On pagination: set intent to `'pagination'`, clear snapshot, scroll to table, then `requestAnimationFrame(() => goToPage())`

3. **Pagination scroll** — `tableRef` on `#screenings-results`, `scrollIntoView({ behavior: 'auto', block: 'start' })`, `scroll-margin-top: 7rem` for sticky NavBar. Defer `router.push` one frame so scroll is not cancelled.

4. **Stable table shell** — always render the table wrapper; show “No screenings found” inside it instead of unmounting the whole block.

5. **Search debounce** — only `setUI({ q })`; do **not** call `onApply()`. Apply / Reset still call `onApply()` to reset page when needed.

6. **Pagination buttons** — `blur()` on click so focus scroll does not fight programmatic scroll.

7. **No loading overlay on the table** — avoids header/button flash; old rows stay visible until new data arrives.

### Key code references

```ts
// Filters.tsx — debounced search
debounceRef.current = setTimeout(() => {
  setUI({ q: value });
}, 350);

// page.tsx — pagination only
const handlePageChange = (nextPage: number) => {
  loadIntentRef.current = 'pagination';
  scrollSnapshotRef.current = null;
  scrollToTableTop();
  requestAnimationFrame(() => goToPage(nextPage));
};

// page.tsx — filter reload preserves scroll
scrollSnapshotRef.current = window.scrollY;
// ... after screeningsData.loading becomes false:
window.scrollTo({ top: y, behavior: 'auto' });
```

### Prevention / lessons

- Treat **search** and **pagination** as different UX: do not share one scroll strategy.
- Any `router.push()` on the homepage must use `{ scroll: false }` unless you explicitly want top-of-page navigation.
- Avoid inserting/removing loading UI **above** the table; it shifts scroll targets. Prefer keeping the previous table visible or an in-place overlay that does not resize the header block.
- Prefer `behavior: 'auto'` (instant) for pagination scroll when a route update follows immediately; `smooth` is often cancelled by React re-renders.
- Debounced live search should update filter state only; page reset belongs in explicit Apply or a dedicated “filter changed” effect that skips the initial mount (do not break `?page=2` deep links on first load).

### Quick verify

1. Scroll to Now Playing, type in search → page stays put; results update in place.
2. Scroll to bottom, click Next/Prev → jumps to screening table top, not page hero.
3. Click Apply with filters → no header/button flash; scroll unchanged on page 1.
4. Open `/?page=2`, refresh → still page 2 (filter effect must not reset page on mount).
