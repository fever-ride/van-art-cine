/**
 * Cinema API wrapper.
 * Fetches the list of all cinemas for use in filter dropdowns.
 */
import { cache } from 'react';

export type Cinema = { id: number; name: string };

export async function apiListCinemas(): Promise<Cinema[]> {
  const res = await fetch('/api/cinemas', { credentials: 'include' });
  if (!res.ok) return []; // safe fallback
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * Server side only. Same reasoning as `getScreeningsServerSide` in
 * `frontend/app/lib/screenings.ts`: a relative URL only resolves for a real
 * incoming HTTP request, not a fetch() made during Server Component
 * rendering, so this needs an absolute URL instead of `apiListCinemas`'s.
 * Wrapped in cache() so a page that calls this from both generateMetadata
 * and its body (e.g. to name a single selected cinema) only fetches once.
 */
export const getCinemasServerSide = cache(async (): Promise<Cinema[]> => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/cinemas`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
});