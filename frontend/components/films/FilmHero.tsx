import type { Film, UpcomingScreening } from '@/app/lib/films';
import {
  cleanDisplayText,
  formatPeopleLine,
  isValidRtRating,
  parseImdbRating,
} from '@/app/lib/displayText';
import { formatGenre } from '@/app/lib/formatGenre';
import { formatScreeningDate, formatScreeningTime } from '@/app/lib/formatDate';
import { RatedBadge } from '@/components/ui';
import HeroGlow from '@/components/HeroGlow';
import SiteIntroBar from '@/components/SiteIntroBar';

type Props = {
  film: Pick<
    Film,
    | 'title'
    | 'year'
    | 'country'
    | 'genre'
    | 'rated'
    | 'imdb_rating'
    | 'imdb_votes'
    | 'rt_rating_pct'
    | 'imdb_url'
    | 'directors'
    | 'poster_url'
  >;
  /** Soonest upcoming screening, if any — shown as the "Next screening"
   * card with the page's one primary action (Get tickets). */
  nextScreening?: UpcomingScreening;
  /** Visitor came from outside the site and hasn't dismissed the intro:
   * show the one-line "what is this site" eyebrow at the top of the hero. */
  showIntro?: boolean;
};

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=600&auto=format&fit=crop';

/**
 * Film detail hero (the page most visitors land on from search).
 *
 * Same backdrop as the homepage hero (HeroGlow). Holds everything the old
 * FilmHeader did — poster, title (the page's only <h1>), year / country /
 * runtime / director, genres, rating badge, IMDb (with votes) and RT
 * scores, IMDb profile link — plus the soonest screening with a ticket
 * button, so "when and where can I see it" is answered above the fold.
 * IMDb is now a secondary text link; apricot is reserved for Get tickets.
 */
export default function FilmHero({ film, nextScreening, showIntro = false }: Props) {
  const {
    title,
    year,
    country,
    genre,
    rated,
    imdb_rating,
    imdb_votes,
    rt_rating_pct,
    imdb_url,
    directors,
    poster_url,
  } = film;

  const poster = poster_url && poster_url.trim() !== '' ? poster_url : FALLBACK_POSTER;
  const countriesText = cleanDisplayText(country);
  const genres = formatGenre(genre);
  const dirLine = formatPeopleLine(directors);
  const imdbRating = parseImdbRating(imdb_rating);
  const hasRt = isValidRtRating(rt_rating_pct);

  const facts = [
    year ? String(year) : null,
    countriesText || null,
    nextScreening?.runtime_min ? `${nextScreening.runtime_min} min` : null,
    dirLine ? `Dir. ${dirLine}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="relative isolate overflow-hidden bg-hero-bg text-white">
      <HeroGlow className="-z-10" />
      {/* Same vertical padding as the homepage hero, so the two banners share one rhythm. */}
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-12 md:py-16 lg:flex-row lg:items-end">
        {/* Poster + text (sm+): the intro line's top lines up with the
            poster's top edge, the film info's bottom with the poster's bottom
            edge. The poster spans both rows and sets the height, so
            dismissing the intro leaves the film info exactly where it was.
            Phone: the intro spans the full width above (too narrow beside
            the poster); film info still sits on the poster's bottom edge. */}
        <div
          className={
            'grid min-w-0 grow grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 sm:grid-cols-[133px_minmax(0,1fr)] sm:gap-x-6 ' +
            (showIntro
              ? "[grid-template-areas:'intro_intro'_'poster_text'] "
              : "[grid-template-areas:'poster_text'] ") +
            "sm:[grid-template-areas:'poster_intro'_'poster_text'] sm:grid-rows-[auto_1fr]"
          }
        >
          {showIntro && (
            <div className="[grid-area:intro]">
              <SiteIntroBar />
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- external TMDB poster, same as before */}
          <img
            src={poster}
            alt={`${title} poster`}
            className="h-[150px] w-[100px] rounded-control object-cover ring-1 ring-white/15 [grid-area:poster] sm:h-[200px] sm:w-[133px]"
          />

          <div className="min-w-0 self-end [grid-area:text]">
            <h1 className="text-[clamp(26px,4vw,48px)] font-bold uppercase leading-[0.98] tracking-[-0.02em]">
              {title}
            </h1>

            {facts.length > 0 && (
              <p className="mt-2 text-sm text-white/80 sm:text-base">{facts.join(' · ')}</p>
            )}

            {(genres.length > 0 || rated) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-control border border-white/30 px-1.5 py-0.5 text-label font-medium uppercase tracking-wide text-white/90"
                  >
                    {g}
                  </span>
                ))}
                <RatedBadge rated={rated} />
              </div>
            )}

            {(imdbRating != null || hasRt || imdb_url) && (
              /* Last row of the block, whose bottom sits on the poster's bottom
                 edge. leading-none drops the line-height slack under the
                 glyphs, so the lowest visible marks (IMDb badge, link
                 underline) meet the poster edge — optical, not box,
                 alignment. Nudging further down made the poster look like it
                 floated above the text. */
              <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 leading-none [&_*]:leading-none">
                {imdbRating != null && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="rounded-[3px] bg-imdb px-1.5 py-0.5 text-micro font-extrabold leading-none text-black">
                      IMDb
                    </span>
                    <span className="font-display text-xl font-bold">{imdbRating.toFixed(1)}</span>
                    {typeof imdb_votes === 'number' && (
                      <span className="text-sm text-white/70">({imdb_votes.toLocaleString()})</span>
                    )}
                  </span>
                )}
                {hasRt && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-sm text-white/70">Rotten Tomatoes</span>
                    <span className="font-display text-xl font-bold">{rt_rating_pct}%</span>
                  </span>
                )}
                {imdb_url && (
                  <a
                    href={imdb_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/80 underline underline-offset-2 hover:text-white"
                  >
                    IMDb profile ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <NextScreeningCard screening={nextScreening} />
      </div>
    </section>
  );
}

function NextScreeningCard({ screening }: { screening?: UpcomingScreening }) {
  if (!screening) {
    return (
      <div className="w-full shrink-0 rounded-card bg-white/10 px-4 py-3 text-sm text-white/80 lg:w-80">
        No upcoming screenings in Vancouver right now.
      </div>
    );
  }
  const dt = new Date(screening.start_at_utc);
  return (
    <div className="w-full shrink-0 rounded-card bg-white/10 p-4 backdrop-blur-sm lg:w-80">
      <div className="text-label font-semibold uppercase tracking-[0.08em] text-white/70">
        Next screening
      </div>
      <div className="mt-1 font-display text-lg font-bold">
        {formatScreeningDate(dt)} · {formatScreeningTime(dt)}
      </div>
      <div className="text-sm text-white/80">{screening.cinema_name}</div>
      {screening.source_url ? (
        <a
          href={screening.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-11 items-center justify-center rounded-btn bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Get tickets
        </a>
      ) : (
        <div className="mt-3 text-sm text-white/70">No ticket link</div>
      )}
    </div>
  );
}
