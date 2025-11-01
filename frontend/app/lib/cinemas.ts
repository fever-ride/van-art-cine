export type Cinema = { id: number; name: string };

export async function apiListCinemas(): Promise<Cinema[]> {
  const res = await fetch('/api/cinemas', { credentials: 'include' });
  if (!res.ok) return []; // safe fallback
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}