'use client';

import type { Film } from '@/app/lib/films';
import { isMissingText } from '@/app/lib/typeGuards';
import { COL_LABEL } from '@/components/screenings/ScreeningRowParts';

type Props = {
  film: Pick<Film, 'language' | 'description'> & {
    writers: Film['writers'];
    cast: Film['cast'];
  };
};

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
          .filter((s) => s && !isMissingText(s))
      : [];

  // Description
  const description =
    film.description && !isMissingText(film.description)
      ? film.description.trim()
      : '';

  const hasAnyDetail =
    !!description ||
    langs.length > 0 ||
    writers.length > 0 ||
    topCast.length > 0;

  // Label/value rows, same small-caps label style as the homepage lists.
  const rows: [string, string][] = [];
  if (langs.length > 0) rows.push(['Language', langs.join(', ')]);
  if (writers.length > 0) rows.push([writers.length > 1 ? 'Writers' : 'Writer', writers.join(', ')]);
  if (topCast.length > 0) rows.push(['Cast', topCast.join(', ')]);

  return (
    <section aria-labelledby="film-about-heading">
      <h2 id="film-about-heading" className="mb-3 font-display text-xl font-bold uppercase text-primary md:text-2xl">
        About the film
      </h2>

      {/* Same frame as the showtimes list beside it. */}
      <div className="rounded-card border border-rule bg-surface p-4 md:p-5">
        {!hasAnyDetail && (
          <p className="text-sm text-muted">No additional details available.</p>
        )}

        {description && (
          <p className="text-[15px] leading-relaxed text-primary">{description}</p>
        )}

        {rows.length > 0 && (
          <dl
            className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm ${
              description ? 'mt-4 border-t border-border pt-4' : ''
            }`}
          >
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className={`${COL_LABEL} pt-0.5`}>{label}</dt>
                <dd className="text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
