import Link from 'next/link';
import { getButtonClassName } from '@/components/ui';

export const metadata = {
  title: "About",
  description: "The Cinephile's Van is a Vancouver indie cinema guide covering movie listings for Vancouver's independent movie theaters. Find what films are playing in Vancouver and plan your next screening.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Hero Section */}
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-primary mb-3">
          About The Cinephile&rsquo;s Van
        </h1>
        <p className="text-lg text-muted leading-relaxed max-w-2xl">
          Your guide to Vancouver&rsquo;s independent cinema scene. Browse screenings,
          discover films, and never miss a showing at your favorite indie theaters.
        </p>
      </header>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 mb-8">
        {/* What We Do */}
        <section className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-bold text-primary mb-3">What We Do</h2>
          <p className="text-muted leading-relaxed">
            The Cinephile&rsquo;s Van aggregates screenings from Vancouver&rsquo;s independent cinemas.
            Filter by theater, date, or film, add favorites to your watchlist, and plan your movie nights.
          </p>
        </section>

        {/* Tech Stack */}
        <section className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-bold text-primary mb-3">Tech Stack</h2>
          <p className="text-muted leading-relaxed">
            Built with Next.js, React, Tailwind CSS, Node.js/Express, Prisma ORM, and PostgreSQL.
          </p>
        </section>

        {/* Data & Attribution */}
        <section className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-bold text-primary mb-3">Data Sources</h2>
          <p className="text-muted leading-relaxed">
            Screening times from cinema websites. Film metadata enriched via TMDB and OMDb APIs.
            All trademarks belong to their respective owners.
          </p>
        </section>

        {/* Contact */}
        <section className="rounded-card border border-border bg-surface p-6">
          <h2 className="text-xl font-bold text-primary mb-3">Get in Touch</h2>
          <p className="text-muted leading-relaxed">
            Found a bug or have feedback?{" "}
            <a href="mailto:wendyzhong08@outlook.com" className="text-accent hover:text-accent-hover underline font-medium">
              Email me
            </a>
          </p>
        </section>
      </div>

      {/* Developer CTA */}
      <section className="rounded-card border-2 border-accent bg-surface p-8 mb-8">
        <h2 className="text-2xl font-bold text-primary mb-3">
          Built by Wendy Zhong
        </h2>
        <p className="text-muted leading-relaxed mb-4">
          Film-loving CS student actively seeking internships and part-time developer opportunities.
        </p>
        <Link
          href="https://www.linkedin.com/in/wendi-zhong/"
          target="_blank"
          rel="noopener noreferrer"
          className={getButtonClassName({ variant: 'primary', size: 'md' }) + ' inline-flex items-center gap-2'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M19 0h-14C2.239 0 0 2.239 0 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5V5c0-2.761-2.238-5-5-5zM8 19H5V9h3v10zm-1.5-11.3c-.966 0-1.75-.79-1.75-1.7s.784-1.7 1.75-1.7S8 5.1 8 6s-.784 1.7-1.75 1.7zM20 19h-3v-5.5c0-1.2-.02-2.7-1.65-2.7-1.65 0-1.9 1.3-1.9 2.6V19h-3V9h2.9v1.4h.04c.4-.7 1.37-1.4 2.82-1.4 3.02 0 3.78 2 3.78 4.7V19z" />
          </svg>
          Connect on LinkedIn
        </Link>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-muted">
        Version 0.1.0 • Last updated {new Date().toLocaleDateString()}
      </footer>
    </main>
  );
}