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
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="bg-table-header-bg px-6 py-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-white">
          Film Details
        </h3>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Description */}
        {description && (
          <div>
            <p className="text-[15px] leading-relaxed text-primary">
              {description}
            </p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-4 text-sm pt-3">
          {langs.length > 0 && (
            <div className="flex gap-4">
              <span className="font-semibold text-primary w-20">Language</span>
              <span className="text-primary">{langs.join(', ')}</span>
            </div>
          )}

          {!isMissingText(film.rated) && film.rated && (
            <div className="flex gap-4">
              <span className="font-semibold text-primary w-20">Rated</span>
              <span className="text-primary">{film.rated}</span>
            </div>
          )}

          {writers.length > 0 && (
            <div className="flex gap-4">
              <span className="font-semibold text-primary w-20">Writer{writers.length > 1 ? 's' : ''}</span>
              <span className="text-primary">{writers.join(', ')}</span>
            </div>
          )}

          {topCast.length > 0 && (
            <div className="flex gap-4">
              <span className="font-semibold text-primary w-20">Cast</span>
              <span className="text-primary">{topCast.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

