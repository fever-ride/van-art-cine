'use client';

import type { Film } from '@/app/lib/films';

type Props = {
  film: Pick<
    Film,
    'year' | 'language' | 'country' | 'genre' | 'rated' | 'awards'
  > & { directors: Film['directors']; writers: Film['writers']; cast: Film['cast'] };
};

export default function FilmMeta({ film }: Props) {
  const dash = '-';
  const list = (arr?: string[]) => (arr && arr.length ? arr.join(', ') : dash);
  const topCast = film.cast?.slice(0, 5) ?? [];

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-md">
      {/* Cream header band to match site */}
      <div className="rounded-t-2xl border-b border-gray-200 bg-[#FFF8E7] px-4 py-2">
        <h2 className="text-[15px] font-semibold text-gray-800">About</h2>
      </div>

      <div className="p-4 md:p-6">
        {/* Group A: full-width rows */}
        <dl className="space-y-2">
          <FactRow label="Director" value={list(film.directors)} />
          <FactRow label="Writer" value={list(film.writers)} />
          <FactRow label="Top cast" value={topCast.length ? topCast.join(', ') : dash} />
        </dl>

        {/* Group B: two-column grid on md+, stacked on mobile */}
        <dl className="mt-4 grid gap-x-8 gap-y-2 md:grid-cols-2">
          <FactRow label="Year" value={film.year ?? dash} />
          <FactRow label="Language" value={film.language ?? dash} />
          <FactRow label="Country" value={film.country ?? dash} />
          <FactRow label="Genre" value={film.genre ?? dash} />
          <FactRow label="Rated" value={film.rated ?? dash} />
          <FactRow label="Awards" value={film.awards ?? dash} />
        </dl>
      </div>
    </section>
  );
}

/** One label/value line (grid with fixed label column) */
function FactRow({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-gray-900">{value}</dd>
    </div>
  );
}