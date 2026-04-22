'use client';

import type { ReactNode } from 'react';
import type { Film } from '@/app/lib/films';
import { isMissingText } from '@/app/lib/typeGuards';

type Props = {
  film: Pick<Film, 'language' | 'rated' | 'description'> & {
    writers: Film['writers'];
    cast: Film['cast'];
  };
};

function missing(text: string) {
  return <span className="italic text-muted">{text}</span>;
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
    <section className="rounded-card border border-border bg-surface p-6">
      <h3 className="text-lg font-bold text-primary mb-4">Film Details</h3>
      <dl className="text-sm text-primary divide-y divide-border">
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
              <span className="text-[15px] leading-7 text-primary block">
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
    <div className="grid grid-cols-[120px_1fr] items-start gap-4 py-3">
      <dt className="text-[12px] font-semibold text-primary">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words text-[14px] text-primary">
        {value}
      </dd>
    </div>
  );
}