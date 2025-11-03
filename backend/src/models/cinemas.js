// src/models/cinemas.js
import { prisma } from '../lib/prismaClient.js';

export async function listCinemas() {
  const rows = await prisma.cinema.findMany({
    select: { id: true, name: true },
    where: { name: { not: '' } },     // exclude empty strings
    orderBy: { name: 'asc' },
  });
  return rows.filter(r => r.name && r.name.trim() !== '');
}