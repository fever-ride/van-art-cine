import { getFilmDetail } from '@/app/lib/films';
import FilmHeader from '@/components/films/FilmHeader';
import FilmMeta from '@/components/films/FilmMeta';
import FilmShowtimes from '@/components/films/FilmShowtimes';

import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

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

      {/* Two-column layout for Meta + Showtimes */}
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[0.4fr_0.6fr]">
        {/* LEFT: Meta (always rendered, even if some fields are missing) */}
        <div>
          <FilmMeta film={film} />
        </div>

        {/* RIGHT: Showtimes */}
        <div>
          <FilmShowtimes
            upcoming={upcoming}
            filmTitle={film.title ?? 'This Film'}
          />
        </div>
      </div>
    </main>
  );
}