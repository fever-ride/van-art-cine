import type { MetadataRoute } from 'next';

const SITE_URL = 'https://www.cinephilesvan.com';
const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

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
  ];

  try {
    const res = await fetch(`${API_BASE}/api/screenings?limit=500`, {
      next: { revalidate: 3600 }, // 1 hour, ISR (Incremental Static Regeneration)
    });
    if (!res.ok) return staticRoutes;

    const data = await res.json();
    const items: Array<{ film_id: number }> = data.items ?? [];

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
