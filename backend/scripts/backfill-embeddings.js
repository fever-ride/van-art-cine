import 'dotenv/config';
import { prisma } from '../src/lib/prismaClient.js';
import { upsertFilmEmbedding } from '../src/services/embeddingService.js';

const BATCH_SIZE = 20;
const DELAY_MS = 500;

async function main() {
  const forceAll = process.argv.includes('--all');

  const allFilmIds = (
    await prisma.film.findMany({ select: { id: true }, orderBy: { id: 'asc' } })
  ).map((f) => f.id);

  let filmIds;
  if (forceAll) {
    filmIds = allFilmIds;
    console.log(`[backfill] --all: will embed all ${filmIds.length} films`);
  } else {
    const existing = (
      await prisma.$queryRawUnsafe('SELECT film_id FROM film_embedding')
    ).map((r) => r.film_id);
    const existingSet = new Set(existing);
    filmIds = allFilmIds.filter((id) => !existingSet.has(id));
    console.log(
      `[backfill] incremental: ${filmIds.length} films missing embeddings (${existing.length} already done)`
    );
  }

  if (filmIds.length === 0) {
    console.log('[backfill] nothing to do');
    return;
  }

  let done = 0;
  let errors = 0;

  for (let i = 0; i < filmIds.length; i += BATCH_SIZE) {
    const batch = filmIds.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((id) => upsertFilmEmbedding(id))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) done++;
      else if (r.status === 'rejected') {
        errors++;
        console.error(`  error:`, r.reason?.message || r.reason);
      }
    }

    console.log(`[backfill] ${done + errors}/${filmIds.length} processed (${errors} errors)`);

    if (i + BATCH_SIZE < filmIds.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[backfill] done: ${done} embedded, ${errors} errors`);
}

main()
  .catch((err) => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
