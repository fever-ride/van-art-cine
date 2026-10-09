import type { MetadataRoute } from 'next';

const SITE_URL = 'https://www.cinephilesvan.com';
const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/whats-on/top-rated`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  try {
    // The backend caps `limit` at 200 (backend/src/validators/screeningsValidators.js),
    // well under this catalog's current ~500+ upcoming screenings, so a
    // single fetch silently returned only the first 200 — this sitemap had
    // been listing zero film pages, only the two static routes above, with
    // no visible error (a non-ok response just falls through to
    // staticRoutes). Paginate using the response's own `total` instead.
    const PAGE_SIZE = 200;
    const items: Array<{ film_id: number }> = [];

    const firstRes = await fetch(
      `${API_BASE}/api/screenings?limit=${PAGE_SIZE}&offset=0`,
      { next: { revalidate: 3600 } } // 1 hour, ISR (Incremental Static Regeneration)
    );
    if (!firstRes.ok) return staticRoutes;

    const firstPage = await firstRes.json();
    items.push(...(firstPage.items ?? []));
    const total: number = firstPage.total ?? items.length;

    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
      const res = await fetch(
        `${API_BASE}/api/screenings?limit=${PAGE_SIZE}&offset=${offset}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) break; // partial coverage beats none from a mid-run failure
      const page = await res.json();
      items.push(...(page.items ?? []));
    }

    const filmIds = [...new Set(items.map((s) => s.film_id))];

    const filmRoutes: MetadataRoute.Sitemap = filmIds.map((id) => ({
      url: `${SITE_URL}/films/${id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    // Homepage pagination beyond page 1: indexable (no noindex, has its own
    // canonical — see app/page.tsx's CanonicalLink/shouldNoindex) but was
    // never listed here, so a crawler could only reach page 2+ by following
    // in-page Pagination links, never via the sitemap itself.
    // HOMEPAGE_PAGE_SIZE must match `defaultUI.limit` in
    // lib/hooks/screeningsUrlState.ts (already duplicated there from
    // useScreeningsUI.ts, per that file's own comment) — there's no shared
    // constant yet, so keep these in sync by hand if either changes.
    const HOMEPAGE_PAGE_SIZE = 20;
    const totalPages = Math.ceil(total / HOMEPAGE_PAGE_SIZE);
    const pageRoutes: MetadataRoute.Sitemap = Array.from(
      { length: Math.max(0, totalPages - 1) },
      (_, i) => ({
        url: `${SITE_URL}/?page=${i + 2}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.6,
      })
    );

    // Named-cinema filter views: app/page.tsx's `shouldNoindex` deliberately
    // exempts these ("a named-cinema filter is exempt: that is exactly the
    // kind of stable, searched-for page worth letting rank"), but nothing
    // elsewhere links to or lists `?cinema_ids=<id>` — a crawler had no way
    // to discover them at all. One route per cinema (not combinations of
    // several), matching the single stable per-venue URL worth ranking.
    let cinemaRoutes: MetadataRoute.Sitemap = [];
    try {
      const cinemasRes = await fetch(`${API_BASE}/api/cinemas`, {
        next: { revalidate: 3600 },
      });
      if (cinemasRes.ok) {
        const { items: cinemas } = await cinemasRes.json();
        cinemaRoutes = (cinemas as Array<{ id: number }>).map((c) => ({
          url: `${SITE_URL}/?cinema_ids=${c.id}`,
          lastModified: new Date(),
          changeFrequency: 'daily',
          priority: 0.7,
        }));
      }
    } catch {
      // Partial sitemap (film + page routes) beats none from this alone.
    }

    return [...staticRoutes, ...filmRoutes, ...pageRoutes, ...cinemaRoutes];
  } catch {
    return staticRoutes;
  }
}
