'use client';

import type { Film } from '@/app/lib/films';

type Props = {
  film: Pick<Film, 'language' | 'rated' | 'description'> & {
    writers: Film['writers'];
    cast: Film['cast'];
  };
};

export default function FilmMeta({ film }: Props) {
  const dash = '—';
  const list = (arr?: string[]) => (arr && arr.length ? arr.join(', ') : dash);
  const topCast = film.cast?.slice(0, 5) ?? [];
  const langs =
    typeof film.language === 'string' && film.language.trim()
      ? film.language.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-md">
      {/* Two-column body (right side slightly wider) */}
      <div className="p-4 md:p-6 md:grid md:grid-cols-[1.5fr_1.5fr] md:gap-25">
        {/* Left: Description */}
        <div>
          {film.description?.trim() ? (
            <p className="text-[15px] leading-7 text-gray-800">
              {film.description}
            </p>
          ) : (
            <p className="italic text-gray-400">{dash}</p>
          )}
        </div>

        {/* Right: Info */}
        <dl className="mt-6 grid gap-x-8 gap-y-3 md:mt-0">
          <FactRow
            label="Language"
            value={
              langs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {langs.map((lg) => (
                    <span
                      key={lg}
                      className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800"
                    >
                      {lg}
                    </span>
                  ))}
                </div>
              ) : (
                film.language || dash
              )
            }
          />
          <FactRow label="Rated" value={film.rated || dash} />
          <FactRow label="Writer" value={list(film.writers)} />
          <FactRow label="Top cast" value={topCast.length ? topCast.join(', ') : dash} />
        </dl>
      </div>
    </section>
  );
}

function FactRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-gray-900">{value}</dd>
    </div>
  );
}