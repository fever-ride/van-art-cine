import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Watchlist',
  robots: { index: false, follow: false },
};

export default function WatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
