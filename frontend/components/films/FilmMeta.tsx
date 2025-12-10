'use client';

import type { ReactNode } from 'react';
import type { Film } from '@/app/lib/films';

type Props = {
  film: Pick<Film, 'language' | 'rated' | 'description'> & {
    writers: Film['writers'];
    cast: Film['cast'];
  };
};

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
  // Cast
  const topCastRaw = film.cast?.slice(0, 5) ?? [];
  const topCast = topCastRaw
    .map((c) => c.trim())
    .filter((c) => c && !isMissingText(c));

  // Writers
  const writers = (film.writers ?? [])
    .map((w) => w.trim())
    .filter((w) => w && !isMissingText(w));

  // Languages
  const rawLang = isMissingText(film.language) ? '' : film.language ?? '';
  const langs =
    rawLang && rawLang.trim()
      ? rawLang
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  // Description
  const description =
    film.description && !isMissingText(film.description)
      ? film.description.trim()
      : '';

  return (
    <section className="mt-4 px-4 md:px-7">
      <dl className="border-t border-border/60 text-sm text-gray-900 divide-y divide-border/60">
        <FactRow
          label="Language"
          value={
            langs.length > 0 ? langs.join(', ') : missing('No language available.')
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

        <FactRow
          label="Description"
          value={
            description ? (
              <span className="text-[15px] leading-7 text-gray-800 block">
                {description}
              </span>
            ) : (
              missing('No description available.')
            )
          }
        />
      </dl>
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
    <div className="grid grid-cols-[130px_1fr] items-start gap-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words text-[14px] text-gray-900">
        {value}
      </dd>
    </div>
  );
}