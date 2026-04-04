import Link from 'next/link';
import { getButtonClassName } from '@/components/ui';

export const metadata = {
  title: "About",
  description: "The Cinephile's Van is a Vancouver indie cinema guide covering movie listings for Vancouver's independent movie theaters. Find what films are playing in Vancouver and plan your next screening.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-semibold">About The Cinephile&rsquo;s Van</h1>

      <section className="mb-8 space-y-3">
        <p className="text-muted">
          The Cinephile&rsquo;s Van helps you keep up with Vancouver&rsquo;s independent cinemas: browse what&rsquo;s on,
          filter by what you care about, and plan your night out. Add screenings to a personal
          watchlist, then come back when you&rsquo;re ready to go. 🎬
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-xl font-medium">Data &amp; Attribution</h2>
        <p className="text-muted">
          Screening times are collected from cinemas&rsquo; public websites. Film details (years,
          ratings, etc.) are enriched via third-party APIs (e.g., TMDB, OMDb). We&rsquo;re grateful to the
          community that maintains these resources. All trademarks belong to their respective owners.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-xl font-medium">Tech Stack</h2>
        <p className="text-muted">
          Next.js + React, Tailwind CSS, Node.js/Express API, Prisma ORM, and PostgreSQL.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-xl font-medium">Contact</h2>
        <p className="text-muted">
          Spot an error or have a suggestion? Email{" "}
          <a href="mailto:wendyzhong08@outlook.com" className="text-blue-600 underline">
            wendyzhong08@outlook.com
          </a>
          .
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-xl font-medium">Actively Seeking Internships and Part-Time Projects.</h2>
        <p className="text-muted">
          Hi, I&rsquo;m Wendy! A film-loving CS student exploring whatever types of developer opportunities.<br />
          Connect with me on{" "}
          <Link
            href="https://www.linkedin.com/in/wendi-zhong/"
            target="_blank"
            rel="noopener noreferrer"
            className={getButtonClassName({ variant: 'outline', size: 'sm' }) + ' inline-flex items-center gap-2'}
            aria-label="Visit Wendy Zhong on LinkedIn (opens in a new tab)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5 text-blue-600"
              aria-hidden="true"
            >
              <path d="M19 0h-14C2.239 0 0 2.239 0 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5V5c0-2.761-2.238-5-5-5zM8 19H5V9h3v10zm-1.5-11.3c-.966 0-1.75-.79-1.75-1.7s.784-1.7 1.75-1.7S8 5.1 8 6s-.784 1.7-1.75 1.7zM20 19h-3v-5.5c0-1.2-.02-2.7-1.65-2.7-1.65 0-1.9 1.3-1.9 2.6V19h-3V9h2.9v1.4h.04c.4-.7 1.37-1.4 2.82-1.4 3.02 0 3.78 2 3.78 4.7V19z" />
            </svg>
            LinkedIn
          </Link>
        </p>
      </section>

      <footer className="mt-10 border-t pt-4 text-sm text-muted">
        Version 0.1.0 • Last updated {new Date().toLocaleDateString()}
      </footer>
    </main>
  );
}