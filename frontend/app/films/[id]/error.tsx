'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, getButtonClassName } from '@/components/ui';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function FilmError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Film page error:', error);
  }, [error]);

  const is404 = error.message.includes('404') || error.message.includes('API 404');

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-center">
      <h1 className="text-xl font-semibold text-primary">
        {is404 ? 'Film not found' : 'Something went wrong'}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {is404
          ? 'This film may have been removed or the link is invalid.'
          : 'We couldn’t load this film. Please try again.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={getButtonClassName({ variant: 'primary', size: 'md' })}>
          Back to screenings
        </Link>
      </div>
    </main>
  );
}
