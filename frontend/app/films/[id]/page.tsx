import { getFilmDetail } from '@/app/lib/films';
import FilmHeader from '@/components/films/FilmHeader';
import FilmMeta from '@/components/films/FilmMeta';
import FilmShowtimes from '@/components/films/FilmShowtimes';

import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

// Helper to decide whether FilmMeta has anything meaningful to show
function filmHasMeta(film: {
  description?: string | null;
  language?: string | null;
  rated?: string | null;
  writers?: string[] | null;
  cast?: string[] | null;
}): boolean {
  const hasCleanText = (value?: string | null): boolean => {
    const t = value?.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    return lower !== 'n/a' && lower !== 'na';
  };

  const hasDescription = hasCleanText(film.description);
  const hasLanguage = hasCleanText(film.language);
  const hasRated = hasCleanText(film.rated);
  const hasWriters = Array.isArray(film.writers) && film.writers.length > 0;
  const hasCast = Array.isArray(film.cast) && film.cast.length > 0;

  return hasDescription || hasLanguage || hasRated || hasWriters || hasCast;
}

export default async function FilmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { film, upcoming } = await getFilmDetail(Number(id));

  return (
    <main className={`${noto.className} mx-auto max-w-7xl px-4 py-8`}>
      <FilmHeader film={film} />

      {filmHasMeta({
        description: film.description,
        language: film.language,
        rated: film.rated,
        writers: film.writers,
        cast: film.cast,
      }) && <FilmMeta film={film} />}

      <FilmShowtimes
        upcoming={upcoming}
        filmTitle={film.title ?? 'This Film'}
      />
    </main>
  );
}