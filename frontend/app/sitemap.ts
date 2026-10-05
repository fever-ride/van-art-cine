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

    return [...staticRoutes, ...filmRoutes];
  } catch {
    return staticRoutes;
  }
}
