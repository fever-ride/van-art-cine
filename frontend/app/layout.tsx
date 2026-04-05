import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from '@/components/NavBar';

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
  alternates: {
    canonical: SITE_URL,
  },
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
        {children}
      </body>
    </html>
  );
}
