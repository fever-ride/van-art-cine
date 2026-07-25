// src/models/cinemas.js
import { prisma } from '../lib/prismaClient.js';

/**
 * Cinemas that should always sort first in the filter sidebar, because
 * they're the venues most people are browsing for. Each name must match
 * `cinema.name` in the DB exactly (case, spacing, punctuation) — a mismatch
 * fails silently (the cinema just isn't pinned) rather than throwing, so if
 * you add/rename one here, double-check the exact string in the DB first.
 *
 * Within this set and within "everything else", cinemas still sort
 * alphabetically — only the pinned group as a whole moves to the front.
 */
const PINNED_CINEMAS = new Set([
  'Rio Theatre',
  'The Cinematheque',
  'VIFF Centre - Lochmaddy Studio Theatre',
  'VIFF Centre - VIFF Cinema',
]);

export async function listCinemas() {
  const rows = await prisma.cinema.findMany({
    select: {
      id: true,
      name: true,
      // Unfiltered relation count: has this cinema ever had *any* screening
      // linked to it at all (active or not, past or future)? This is only
      // meant to catch stray placeholder rows (e.g. a generic "VIFF Centre"
      // entry with zero screenings ever, left over from before venues were
      // split into specific rooms) — deliberately NOT scoped to "upcoming"
      // screenings, so a cinema doesn't flicker in and out of this list just
      // because it happens to have nothing scheduled at this exact moment.
      _count: { select: { screening: true } },
    },
    where: { name: { not: '' } },
    orderBy: { name: 'asc' },
  });

  const realCinemas = rows.filter(
    (r) => r.name && r.name.trim() !== '' && r._count.screening > 0
  );

  // Prisma already returned these alphabetically, so splitting into two
  // groups and concatenating is enough to keep each group alphabetical
  // without re-sorting.
  const pinned = realCinemas.filter((r) => PINNED_CINEMAS.has(r.name));
  const rest = realCinemas.filter((r) => !PINNED_CINEMAS.has(r.name));

  return [...pinned, ...rest].map(({ id, name }) => ({ id, name }));
}
