/** `/whats-on/andrzej-wajda` — server-rendered spotlight page for VIFF
 * Centre's Andrzej Wajda retrospective (real run: Nov 19 - Dec 27, 2026).
 * A one-off curated page, not a generic "director retrospective" template —
 * see BACKLOG.md for why. Reuses the Top Rated hub page's data-fetching
 * pattern (`getFilmsServerSide`/`buildSearchParams`) and structured-data
 * builder, and the same `FilmPosterCard` the Top Rated page uses. */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getFilmsServerSide, buildSearchParams, type FilmListItem } from '@/lib/screenings';
import { ItemListStructuredData } from '@/lib/structuredData';
import { formatScreeningDate, formatScreeningTime } from '@/lib/formatDate';
import FilmPosterCard from '@/components/whats-on/FilmPosterCard';
import ScheduleTable, { type ScheduleRow } from '@/components/whats-on/ScheduleTable';

const SITE_URL = 'https://www.cinephilesvan.com';
const PAGE_URL = `${SITE_URL}/whats-on/andrzej-wajda`;
const TITLE = 'Andrzej Wajda Retrospective: 17 Films at VIFF Centre';
const DESCRIPTION =
  "A complete Andrzej Wajda retrospective in Vancouver, screening at VIFF Centre Nov 19 to Dec 27, 2026, from his War Trilogy to his final film, Katyn.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const DIRECTOR_NAME = 'Andrzej Wajda';
// This retrospective's real run at VIFF Centre — a fixed window, not a
// rolling query, since this page is about one specific past/present/future
// series, not an evergreen "films by this director" listing.
const RETRO_FROM = '2026-11-19';
const RETRO_TO = '2026-12-27';

/** Buckets a film into one of this retrospective's three eras by release
 * year. Returns `null` for a missing year rather than defaulting into the
 * last era — every real Wajda film here has a known year, so a missing one
 * only happens if the backend's director filter let something unrelated
 * through, and that film should disappear from the era sections (it still
 * shows up, correctly, in the Full schedule table below, which isn't
 * era-grouped) rather than get mislabeled as 1990–2007 work. */
function eraOf(year: number | null): 1 | 2 | 3 | null {
  if (year == null) return null;
  if (year <= 1965) return 1;
  if (year <= 1982) return 2;
  return 3;
}

function byYearAsc(a: FilmListItem, b: FilmListItem): number {
  return (a.year ?? 0) - (b.year ?? 0);
}

/** Caption under each poster: the soonest upcoming showtime, or — once a
 * film's whole run here is over — which date(s) it already screened on. */
function posterCaption(film: FilmListItem, now: Date): string {
  const sorted = [...film.showtimes].sort(
    (a, b) => new Date(a.start_at_utc).getTime() - new Date(b.start_at_utc).getTime()
  );
  const upcoming = sorted.find((st) => new Date(st.start_at_utc).getTime() >= now.getTime());

  if (upcoming) {
    const d = new Date(upcoming.start_at_utc);
    return `${formatScreeningDate(d)}, ${formatScreeningTime(d)}`;
  }

  return `Screened ${sorted.map((st) => formatScreeningDate(new Date(st.start_at_utc))).join(' & ')}`;
}

export default async function AndrzejWajdaPage() {
  const query = buildSearchParams({
    director: DIRECTOR_NAME,
    from: RETRO_FROM,
    to: RETRO_TO,
    limit: 50,
  }).toString();
  const { items } = await getFilmsServerSide(query);

  const now = new Date();

  const era1 = items.filter((f) => eraOf(f.year) === 1).sort(byYearAsc);
  const era2 = items.filter((f) => eraOf(f.year) === 2).sort(byYearAsc);
  const era3 = items.filter((f) => eraOf(f.year) === 3).sort(byYearAsc);

  const scheduleRows: ScheduleRow[] = items
    .flatMap((film) =>
      film.showtimes.map((st) => ({
        screeningId: st.screening_id,
        filmTitle: film.title,
        startAtUtc: st.start_at_utc,
        cinemaName: st.cinema_name,
      }))
    )
    .sort((a, b) => new Date(a.startAtUtc).getTime() - new Date(b.startAtUtc).getTime());

  return (
    <main>
      <ItemListStructuredData films={items} />

      <section className="relative isolate overflow-hidden bg-hero-bg py-16 text-white sm:py-20">
        <div
          className="absolute inset-0 scale-105 bg-cover opacity-30 blur-[1px]"
          style={{
            backgroundImage:
              "url('https://upload.wikimedia.org/wikipedia/commons/3/34/Andrzej_Wajda_1974.jpg')",
            backgroundPosition: 'center 35%',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(16,16,16,0.25) 0%, rgba(16,16,16,0.75) 65%, #101010 100%)',
          }}
        />
        <div className="relative mx-auto max-w-[1100px] px-4">
          <span className="inline-block rounded-control border border-accent/50 px-2.5 py-1 text-label font-bold uppercase tracking-wide text-accent">
            VIFF Centre · Nov 19 – Dec 27, 2026
          </span>
          <h1 className="mt-5 text-[clamp(32px,5vw,52px)] font-bold leading-[1.05]">
            Andrzej Wajda: A Retrospective
          </h1>
          <p className="mt-4 max-w-[52ch] text-lg text-white/80">
            Seventeen films screening in Vancouver this winter, from Wajda&apos;s earliest work in the
            1950s to his final film in 2007.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1100px] px-4">
        <p className="max-w-[72ch] py-12 text-lg leading-relaxed text-primary">
          Andrzej Wajda was one of Poland&apos;s most important directors. He led the Polish Film School,
          the movement that brought Polish cinema to international attention in the mid-1950s. His first
          three features were <em>A Generation</em>, <em>Kanal</em>, and <em>Ashes and Diamonds</em>.
          Together they are known as his War Trilogy, among the most studied films of postwar Europe. He
          kept working for five decades, through communist rule and its collapse. <em>Man of Iron</em> won
          the Palme d&apos;Or at Cannes in 1981. In 2000, he received an honorary Academy Award for his
          career. This winter, VIFF Centre in Vancouver presents seventeen of his films. The series runs
          from <em>A Generation</em> in 1955 to <em>Katyn</em>, made in 2007 about the massacre that killed
          his own father. It is a rare chance to see this much of one director&apos;s work on one screen.
        </p>
      </div>

      <nav className="sticky top-(--header-h) z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] gap-1 overflow-x-auto px-4 py-3">
          <a
            href="#era-1"
            className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-accent-strong"
          >
            1955–65 · Polish Film School
          </a>
          <a
            href="#era-2"
            className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-accent-strong"
          >
            1969–82 · Working Under Censorship
          </a>
          <a
            href="#era-3"
            className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-accent-strong"
          >
            1990–2007 · Reckoning with History
          </a>
          <a
            href="#schedule"
            className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-accent-strong"
          >
            Full schedule
          </a>
        </div>
      </nav>

      <EraSection id="era-1" years="1955 – 1965" title="The Polish Film School" films={era1} now={now}>
        <em>A Generation</em>, <em>Kanal</em>, and <em>Ashes and Diamonds</em> are Wajda&apos;s War
        Trilogy, made as the Polish Film School took shape in the mid-1950s. All three deal with the
        German occupation of Poland. Together, they made Wajda internationally known.{' '}
        <em>Innocent Sorcerers</em> is a smaller, contemporary story about a young doctor in Warsaw.{' '}
        <em>The Ashes</em> is an earlier epic, following Polish soldiers under Napoleon.
      </EraSection>

      <EraSection id="era-2" years="1969 – 1982" title="Working Under Censorship" films={era2} now={now}>
        This was Wajda&apos;s most prolific period. It was also the period Polish censors watched most
        closely. <em>Man of Marble</em>, about a bricklayer turned propaganda hero, was held back by
        censors for years. Its sequel, <em>Man of Iron</em>, followed the 1980 shipyard strikes that led
        to Solidarity. It won the Palme d&apos;Or at Cannes in 1981. Martial law was declared that year,
        and Wajda had trouble working in Poland. He made some films abroad instead, including{' '}
        <em>Danton</em>, shot in France.
      </EraSection>

      <EraSection id="era-3" years="1990 – 2007" title="Reckoning with History" films={era3} now={now}>
        Wajda&apos;s later films turn toward history Poland was not allowed to discuss for decades.{' '}
        <em>Korczak</em> tells the true story of a doctor who stayed with the Jewish orphans in his care
        rather than leave them in the Warsaw Ghetto. <em>Katyn</em>, made in his eighties, is personal.
        His father was one of about 22,000 Polish officers killed by Soviet forces at Katyn in 1940.
        Wajda did not learn the full truth until communism fell.
      </EraSection>

      <section id="schedule" className="mx-auto max-w-[1100px] scroll-mt-(--scroll-offset) px-4 py-14">
        <h2 className="text-2xl font-bold text-primary">Full schedule</h2>
        <p className="mt-1.5 text-sm text-muted">
          All {scheduleRows.length} screenings across VIFF Centre&apos;s two screens.
        </p>
        <div className="mt-5">
          <ScheduleTable rows={scheduleRows} />
        </div>
      </section>

      <section className="border-t border-border bg-surface-subtle py-12 text-center">
        <div className="mx-auto max-w-[640px] px-4">
          <h3 className="text-xl font-bold text-primary">Looking for more?</h3>
          <p className="mt-2 text-[15px] text-muted">
            Vancouver&apos;s indie cinemas show something new almost every night, scattered across a dozen
            different calendars. The Cinephile&apos;s Van puts it all in one place, so your kind of film
            doesn&apos;t slip by.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/whats-on/top-rated"
              className="rounded-btn border border-border px-5 py-2.5 text-sm font-bold text-primary hover:bg-surface-hover"
            >
              Top rated screenings →
            </Link>
            <Link
              href="/"
              className="rounded-btn bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-hover"
            >
              See what&apos;s on this week
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function EraSection({
  id,
  years,
  title,
  films,
  now,
  children,
}: {
  id: string;
  years: string;
  title: string;
  films: FilmListItem[];
  now: Date;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-[1100px] scroll-mt-(--scroll-offset) px-4 py-10">
      <div className="max-w-[62ch]">
        <div className="text-label font-bold uppercase tracking-wide text-accent-strong">{years}</div>
        <h2 className="mt-1 text-2xl font-bold text-primary sm:text-[26px]">{title}</h2>
        <p className="mt-2.5 text-[15.5px] leading-relaxed text-muted">{children}</p>
      </div>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory]">
        {films.map((film) => (
          <div key={film.film_id} className="shrink-0 [scroll-snap-align:start]">
            <FilmPosterCard screening={film} showYear />
            <p className="mt-1.5 w-[140px] text-xs text-muted sm:w-[160px]">
              {posterCaption(film, now)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
