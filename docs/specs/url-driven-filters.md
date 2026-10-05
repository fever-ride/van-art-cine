# Spec: URL Driven Screening Filters

Status: Draft, not yet implemented.

Tracked as BACKLOG.md item FE-1, under Frontend Architecture. This is a
foundational fix, not an SEO task by itself, but `docs/specs/homepage-ssr.md`
(BACKLOG.md SEO-3) depends on it and should be updated once this ships. Do
this before finishing SEO-3's narrower version, per the decision recorded
in FE-1.

## Goal

Make every screening list view, not just the default one, addressable by
its own URL, and render any of those views on the server from that URL
alone. A filtered view should be bookmarkable, shareable, and reachable
with the browser's back and forward buttons, the same way the existing
`page` query parameter already works.

## Non-goals

- Do not redesign the filter controls themselves. Checkboxes, date pickers,
  and the search box keep their current look and behavior from the user's
  point of view.
- Do not change how the watchlist works. It stays a separate, client side,
  post-mount concern, unaffected by this work.
- Do not build new dedicated pages for cinemas or tags. Those are tracked
  separately as BACKLOG.md SEO-2, SEO-7, and SEO-10. This spec is about
  the existing homepage's own filtering mechanism.
- Do not require old bookmarked links to keep working in some legacy
  format. The current filters were never reflected in the URL at all, so
  there is nothing old to stay compatible with, other than the existing
  `page` parameter, which keeps its current name and behavior.

## Background

### Current state

- `useScreeningsUI` holds all filter fields, search text, cinema
  selection, date mode, date or date range, sort, order, and page size, in
  a plain `useState`. None of it is reflected in the URL.
- `frontend/app/page.tsx` reads only the `page` number from
  `useSearchParams`. Every other field lives purely in memory.
- `frontend/components/screenings/Filters.tsx` updates filters by calling
  `setUI` directly. It has no `router` or `next/navigation` usage at all.
- `useScreeningsData` watches the `ui` object and refetches from
  `/api/screenings` on the client whenever it changes.

### Why this is a real problem, not just a style preference

- A filtered view cannot be bookmarked or shared. Copying the address bar
  URL after filtering to, for example, one cinema and one date, produces a
  link that reopens to the fully unfiltered default view instead.
- The browser's back and forward buttons do not step through filter
  changes, since none of them touch browser history.
- Refreshing the page always resets to the default view, since the state
  lives only in a React component's memory.
- Search engines cannot index a specific filtered view as its own page,
  since it never has a distinct URL.
- A server can only ever know what to render from the incoming request's
  URL. It has no access to a browser's in-memory React state. As long as
  filters live outside the URL, a server rendered page can only reliably
  handle the single default, unfiltered view, never an arbitrary filter
  combination a visitor's browser happens to be holding in memory.

### Relationship to SEO-3 and homepage-ssr.md

The homepage server rendering spec currently plans to pass a server
fetched `initialItems` value into the client side data hook, and to skip a
redundant first client side fetch when filters are still at their default.
That plan only exists because filter state is not URL driven, and it only
ever covers the single default view.

Once this spec ships, that workaround is no longer needed and should be
removed rather than kept alongside the new approach. The Server Component
reads `searchParams` directly and can render any filter combination, not
only the default one, using the same server side fetch function planned in
homepage-ssr.md. `docs/specs/homepage-ssr.md` should be updated to depend
on this spec instead of describing its own separate, narrower fetching
path.

## URL scheme

Query parameters, all optional. Omit a parameter entirely when it holds
its default value, so the default view keeps a clean URL with no query
string, and so different views that share the same effective state are not
crawled or indexed as separate near duplicate URLs.

- `q`: search text.
- `cinema_ids`: comma separated cinema ids, for example `cinema_ids=3,7`.
- `date`: a single date in `YYYY-MM-DD` form. Present only in single date
  mode.
- `from` and `to`: a date range in `YYYY-MM-DD` form. Present only in range
  mode.
- `sort` and `order`: as today.
- `film_id`: as today.
- `page`: as today, already implemented, unchanged.

Date mode is inferred from which parameters are present, `date` for single
mode or `from`/`to` for range mode, rather than adding a separate `mode`
parameter that could disagree with the other date fields.

## Design decisions

1. `frontend/app/page.tsx` becomes an async Server Component that reads
   `searchParams` directly, the way Next.js passes it to page components,
   and performs the screenings fetch server side for whatever combination
   of parameters is present. This uses the same server side fetch function
   already planned in `docs/specs/homepage-ssr.md`.
2. Replace `useScreeningsUI`'s internal `useState` with a hook that reads
   current filter values from `useSearchParams` and exposes a `setUI`-like
   function that calls `router.push` or `router.replace` with updated
   query parameters, instead of updating local state. Keep the external
   shape of `{ ui, setUI }` exactly the same, both the type signature and
   the fact that it accepts either a partial patch or an updater function.
3. `Filters.tsx` needs no changes at all. It already stages every field
   except search text in its own local `localUI` state, and only calls the
   `setUI` prop once, when the user clicks Apply or Reset. The search box
   already debounces its own input and calls `setUI({ q: value })` once
   after about 350 milliseconds of no further typing. Since `setUI` already
   only fires on these explicit, already-throttled moments today, not on
   every keystroke or every checkbox click, there is no new debouncing or
   throttling to design. `Filters.tsx` simply keeps calling the same prop
   it already calls, unaware that its internals now write to the URL
   instead of to local state.
4. Because `setUI` already only fires on an explicit Apply, Reset, or a
   debounced search commit, use `router.push` for all of these, the same
   as pagination does today. Each one is already a deliberate, discrete
   step a user took, not a rapid stream of intermediate values, so there
   is no history spam risk to guard against with `router.replace` instead.
5. Once the Server Component renders directly from `searchParams`,
   `useScreeningsData` and the client side `getScreenings()` fetch are no
   longer needed for the main list and should be removed, not kept
   alongside the new approach. `ResultsTable` receives its `items` as a
   prop from the Server Component parent and no longer owns its own fetch
   or loading state. Next.js's own client side navigation already
   refetches the relevant Server Component output when the URL changes
   through `router.push` or `router.replace`, so no hand written fetch
   hook is needed for this path. A loading state during that transition
   uses Next.js's own `loading.tsx` or a `Suspense` boundary, the same
   pattern already used for the equivalent case in
   `frontend/app/films/[id]/page.tsx`.

## Acceptance criteria

- Setting any filter, cinema selection, date, search text, or sort order,
  changes the URL to reflect it.
- Copying the URL after filtering and opening it in a new browser tab or a
  different browser reproduces the same filtered view.
- The browser's back and forward buttons step through filter changes as
  expected.
- Refreshing the page preserves the current filtered view.
- `curl` against a filtered URL, with no JavaScript executed, returns real
  film titles and screening data matching that filter, not the default
  unfiltered list.
- The default view's URL has no query string. Views using only default
  values for a given field do not carry that field in the URL.
- `useScreeningsData` and the client side `getScreenings()` fetch are
  removed from the main list rendering path once this ships.

### Existing behavior must not regress

This work changes what `useScreeningsUI` and the page's data fetching do
internally, not what any visible control looks like or how it feels to
use. All of the following must still work exactly as they do today:

- `Filters.tsx` requires no source changes. Its Apply, Reset, and search
  debounce behavior, and everything it looks and feels like to a user, is
  identical after this change.
- The watchlist star toggle, and every other piece of interactivity in
  `ResultsTable`, works exactly as it does today.
- Pagination's existing behavior, including reading and writing the `page`
  query parameter, is unchanged. This spec extends the same pattern to the
  other filter fields, it does not alter how `page` itself already works.
- No existing automated test that currently passes is left broken. Tests
  that assert on `useScreeningsUI` or `useScreeningsData` internals are
  expected to change, since those internals change, but the behavior they
  protect must still be verified some other way, not simply deleted.

## Task breakdown

1. Write the parsing and serializing helpers: one function that reads
   `searchParams` and produces a `UIState`, filling in `defaultUI` values
   for anything absent, and inferring `mode` from whether `date` or
   `from`/`to` is present. Write the reverse function that takes a
   `UIState`, or a patch merged onto the current one, and produces a
   `URLSearchParams`, omitting any field that equals its default. Cover
   both with unit tests before wiring them into any component, since the
   rest of this work depends on them being correct.
2. Add the server side screenings fetch function described in
   `docs/specs/homepage-ssr.md`, if it does not already exist. It is
   needed here regardless of that spec's own status, since this work
   requires a Server Component that can fetch for any filter combination.
3. Rewrite `useScreeningsUI` to use the helpers from step 1: derive `ui`
   from `useSearchParams` instead of `useState`, and implement `setUI` to
   merge the given patch onto the current state and call `router.push`
   with the resulting query string. Keep the exported type signature
   identical to today.
4. Convert `frontend/app/page.tsx` into an async Server Component that
   reads `searchParams`, calls the fetch function from step 2, and passes
   the resulting list down to the existing client component tree.
5. Remove `useScreeningsData` and the client side `getScreenings()` fetch
   from the main list path. `ResultsTable` takes `items` as a prop instead
   of managing its own fetch state. Add a `loading.tsx` or a `Suspense`
   boundary for the transition between navigations, replacing whatever
   loading state `useScreeningsData` used to provide.
6. Manual regression pass against every item in "Existing behavior must
   not regress" above, plus the acceptance criteria for bookmarking,
   sharing, back and forward navigation, and refresh.
7. Update or remove any existing test that directly exercises
   `useScreeningsUI` or `useScreeningsData` as they existed before this
   change, replacing coverage for the behavior they protected rather than
   deleting it outright.

## Risks

- Debounce timing for the search field is unchanged by this work, since
  `Filters.tsx` is not being modified, but it is worth re-confirming that
  the existing 350 millisecond debounce still feels right now that each
  commit triggers a real navigation and a server round trip, not just a
  local state update and a client side fetch.
- The parsing helper from task 1 is the piece most likely to have a subtle
  bug, for example mishandling a `cinema_ids` value with extra whitespace
  or an unexpected order, or misjudging `mode` when both `date` and
  `from`/`to` are present at once from a hand edited URL. Malformed or
  unexpected input should fall back to `defaultUI` for that field rather
  than throwing.
- Existing tests or other code that call `useScreeningsUI` or
  `useScreeningsData` directly will need updating alongside this change.

## Follow ups, not required for this spec

- `docs/specs/homepage-ssr.md` has already been updated to depend on this
  spec and no longer describes its own `initialItems` or skip-refetch
  plan. No further edit to it is needed once this ships, only its own
  remaining tasks: structured data, `generateMetadata`, and the caching
  directive.
- BACKLOG.md SEO-12, making the homepage's pagination controls use real
  links, becomes cheaper to do at the same time as this work, since the
  URL plumbing for navigation already needs to be touched here. Still a
  separate, explicit decision whether to fold it in now or keep it
  deferred as originally scoped.
