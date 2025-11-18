import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');

  // Demo User
  const user = await prisma.app_user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      name: 'Demo User',
      email: 'demo@example.com',
      password_hash: '$2a$10$abcdefghijklmnopqrstuv', // placeholder hash
    },
  });

  // Cinemas
  const cinemas = await prisma.cinema.createMany({
    data: [
      {
        name: 'Demo Cinema One',
        website: 'https://example.com/one',
        address: '123 Demo Street',
      },
      {
        name: 'Demo Cinema Two',
        website: 'https://example.com/two',
        address: '456 Example Ave',
      },
    ],
  });

  const cinemaList = await prisma.cinema.findMany();

  // Helper for time
  const now = Date.now();

  // Films
  const films = await prisma.film.createMany({
    data: [
      {
        title: 'The First Demo Film',
        year: 2023,
        description: 'A placeholder film used for testing the system.',
        tags: ['demo', 'test'],
      },
      {
        title: 'The Second Demo Film',
        year: 2024,
        description: 'Another sample film included for demo purposes.',
        tags: ['sample'],
      },
      {
        title: 'The Third Demo Film',
        year: 2021,
        description: 'A third film, to provide a richer dataset.',
        tags: ['example'],
      },
    ],
  });

  const filmList = await prisma.film.findMany();

  // Screenings
  const screenings = [];

  for (const film of filmList) {
    const count = Math.floor(Math.random() * 2) + 2; // 2–3 screenings each

    for (let i = 0; i < count; i++) {
      const screening = await prisma.screening.create({
        data: {
          film_id: film.id,
          cinema_id: cinemaList[i % cinemaList.length].id,
          start_at_utc: new Date(now + (i + 1) * 3600 * 1000),
          end_at_utc: new Date(now + (i + 2) * 3600 * 1000),
          source_url: 'https://example.com/screening',
          loaded_at_utc: new Date(),
        },
      });

      screenings.push(screening);
    }
  }

  // Add 2 screenings to the user watchlist
  await prisma.watchlist_screening.createMany({
    data: screenings.slice(0, 2).map((s) => ({
      user_uid: user.uid,
      screening_id: s.id,
    })),
  });

  console.log('Seed completed with multiple films & screenings.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });