import Link from 'next/link';
import type { Metadata } from 'next';
import { getButtonClassName } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Film Not Found',
  robots: { index: false, follow: false },
};

/** Rendered by Next.js when `generateMetadata` calls `notFound()` for a film
 * id the backend 404s on — unlike the Suspense-wrapped page body, this runs
 * before any HTML streams, so it's the one place in this route that can
 * still produce a real 404 HTTP status instead of a 200 "soft 404". */
export default function FilmNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-primary">Film not found</h1>
      <p className="mt-2 text-sm text-muted">
        This film may have been removed or the link is invalid.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={getButtonClassName({ variant: 'primary', size: 'md' })}>
          Back to screenings
        </Link>
      </div>
    </main>
  );
}
