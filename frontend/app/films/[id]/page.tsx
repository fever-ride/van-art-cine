import { getFilmDetail } from '@/app/lib/films';
import FilmHeader from '@/components/films/FilmHeader';
import FilmMeta from '@/components/films/FilmMeta';
import FilmShowtimes from '@/components/films/FilmShowtimes';

export default async function FilmPage({ params }: {params: Promise<{id: string}>}) {
  const { id } = await params;
  const {film, upcoming} = await getFilmDetail(Number(id));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <FilmHeader film={film} />
      <FilmMeta film={film} />
      <FilmShowtimes upcoming={upcoming} />
    </main>
  );
}