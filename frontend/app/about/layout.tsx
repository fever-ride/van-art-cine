import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: "The Cinephile's Van is a Vancouver indie cinema guide covering movie listings for Vancouver's independent movie theaters. Find what films are playing in Vancouver and plan your next screening.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
