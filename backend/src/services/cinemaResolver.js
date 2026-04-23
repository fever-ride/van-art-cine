import { prisma } from '../lib/prismaClient.js';

let cachedCinemas = null;

async function loadCinemas() {
  if (cachedCinemas) return cachedCinemas;
  cachedCinemas = await prisma.cinema.findMany({ select: { id: true, name: true } });
  return cachedCinemas;
}

const ALIASES = {
  rio: 'Rio Theatre',
  cinematheque: 'The Cinematheque',
  viff: 'VIFF Centre',
  roundhouse: 'Roundhouse',
};

export async function resolveCinemaHint(hint) {
  if (!hint) return [];

  const cinemas = await loadCinemas();
  const h = hint.toLowerCase().trim();

  const alias = ALIASES[h];
  if (alias) {
    const matches = cinemas.filter((c) => c.name.includes(alias));
    if (matches.length) return matches.map((c) => c.id);
  }

  const exact = cinemas.filter((c) => c.name.toLowerCase() === h);
  if (exact.length) return exact.map((c) => c.id);

  const partial = cinemas.filter((c) => c.name.toLowerCase().includes(h));
  if (partial.length) return partial.map((c) => c.id);

  return [];
}
