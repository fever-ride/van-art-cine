import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = 'https://www.cinephilesvan.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "The Cinephile's Van: Movies Playing in Vancouver's Indie Cinemas",
    template: "%s | The Cinephile's Van",
  },
  description:
    "Browse movie listings for Vancouver BC independent cinemas. Find what films are playing, filter by title or movie theater, and save your picks to a personal watchlist.",
  keywords: [
    'Vancouver cinema',
    'movie listings vancouver bc',
    'vancouver canada movie theater',
    'film screenings Vancouver',
    'vancouver film festival',
  ],
  openGraph: {
    type: 'website',
    siteName: "The Cinephile's Van",
    url: SITE_URL,
    title: "The Cinephile's Van: Movies Playing in Vancouver's Indie Cinemas",
    description:
      "Browse movie listings for Vancouver BC independent cinemas. Find what films are playing, filter by title or movie theater, and save your picks to a personal watchlist.",
  },
  twitter: {
    card: 'summary_large_image',
    title: "The Cinephile's Van: Movies Playing in Vancouver's Indie Cinemas",
    description:
      "Browse movie listings for Vancouver BC independent cinemas. Find what films are playing, filter by title or movie theater, and save your picks to a personal watchlist.",
  },
  // Deliberately no blanket `alternates.canonical` here: a static value would
  // apply to every route that doesn't set its own (e.g. it pointed /about at
  // the homepage before this was removed). Pages needing one set it
  // themselves (films/[id]/page.tsx via generateMetadata; the homepage via
  // a rendered <link> tag — Next's alternates.canonical strips query
  // strings, which the homepage's filtered/paginated URLs need to keep).
  robots: {
    index: true,
    follow: true,
  },
};


export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NavBar />
        <main className="min-h-[calc(100vh-200px)]">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
