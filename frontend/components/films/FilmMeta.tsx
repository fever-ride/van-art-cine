'use client';

import type {Film} from '@/app/lib/films';

type Props = { 
        film: Pick<Film, 'year' | 'language' | 'country' | 'genre' | 'rated' | 'awards'> &
    {directors: Film['directors']; writers: Film['writers']; cast: Film['cast']};
    };

export default function FilmMeta({ film }: Props) {
  const dash = '-';
  const list = (arr?: string[]) => (arr && arr.length ? arr.join(', ') : dash);
  const topCast = film.cast?.slice(0, 5) ?? [];

  return (
    <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm md:p-6">
      <h2 className="mb-3 text-base font-semibold">Fact box</h2>

      {/* Group A: full-width rows */}
      <div className="space-y-2">
        <FactRow label="Director" value={list(film.directors)} />
        <FactRow label="Writer" value={list(film.writers)} />
        <FactRow label="Top cast" value={topCast.length ? topCast.join(', ') : dash} />
      </div>

      {/* Group B: two-column grid on md+, stacked on mobile */}
      <div className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2">
        <FactRow label="Year" value={film.year ?? dash} />
        <FactRow label="Language" value={film.language ?? dash} />
        <FactRow label="Country" value={film.country ?? dash} />
        <FactRow label="Genre" value={film.genre ?? dash} />
        <FactRow label="Rated" value={film.rated ?? dash} />
        <FactRow label="Awards" value={film.awards ?? dash} />
      </div>
    </section>
  );
}

/** One label/value line */
function FactRow({ label, value }: { 
	readonly label: string; readonly value: React.ReactNode 
}) {
  return (
    <div className="flex items-baseline flex-start text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="ml-4 text-right font-medium">{value}</dd>
    </div>
  );
}