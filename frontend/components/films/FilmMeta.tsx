'use client';

import type { ReactNode } from 'react';
import type { Film } from '@/app/lib/films';

type Props = {
  film: Pick<Film, 'language' | 'rated' | 'description'> & {
    writers: Film['writers'];
    cast: Film['cast'];
  };
};

const dash = '—';

function isMissingText(value?: string | null): boolean {
  const t = value?.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return lower === 'n/a' || lower === 'na';
}

function missing(text: string) {
  return <span className="italic text-gray-400">{text}</span>;
}

export default function FilmMeta({ film }: Props) {
  const topCastRaw = film.cast?.slice(0, 5) ?? [];
  const topCast = topCastRaw
    .map((c) => c.trim())
    .filter((c) => c && !isMissingText(c));

  const writers = (film.writers ?? [])
    .map((w) => w.trim())
    .filter((w) => w && !isMissingText(w));

  // Normalize languages
  const rawLang = isMissingText(film.language) ? '' : film.language ?? '';
  const langs =
    rawLang && rawLang.trim()
      ? rawLang
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const description =
    film.description && !isMissingText(film.description)
      ? film.description.trim()
      : '';

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface">
      {/* Two-column body (right side slightly wider) */}
      <div className="p-4 md:p-6 md:grid md:grid-cols-[1.5fr_1.5fr] md:gap-25">
        {/* Left: Description */}
        <div>
          {description ? (
            <p className="text-[15px] leading-7 text-gray-800">
              {description}
            </p>
          ) : (
            <p className="text-[15px] italic text-gray-400">
              No description available.
            </p>
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
                missing('No language available.')
              )
            }
          />

          <FactRow
            label="Rated"
            value={
              isMissingText(film.rated)
                ? missing('No rating available.')
                : film.rated
            }
          />

          <FactRow
            label="Writer"
            value={
              writers.length > 0
                ? writers.join(', ')
                : missing('No writer information available.')
            }
          />

          <FactRow
            label="Top cast"
            value={
              topCast.length > 0
                ? topCast.join(', ')
                : missing('No cast information available.')
            }
          />
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
  readonly value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-gray-900">{value}</dd>
    </div>
  );
}