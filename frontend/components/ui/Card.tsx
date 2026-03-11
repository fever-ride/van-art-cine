'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional band (e.g. cream header strip). Rendered at top with band bg. */
  band?: ReactNode;
  /** Optional class for the band container (default uses bg-band). Use e.g. bg-highlight for alternate style. */
  bandClassName?: string;
  className?: string;
};

export default function Card({ children, band, bandClassName, className = '' }: Props) {
  return (
    <section
      className={[
        'overflow-hidden rounded-card border border-border bg-surface shadow-md',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {band != null ? (
        <>
          <div className={bandClassName != null ? `border-b border-border ${bandClassName}` : 'border-b border-border bg-band px-5 py-3'}>
            {band}
          </div>
          {children}
        </>
      ) : (
        children
      )}
    </section>
  );
}
