'use client';

import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  /** When true, uses error border and focus ring */
  error?: boolean;
};

const baseClass =
  'w-full rounded-input border bg-surface px-3 py-2.5 text-sm outline-none ring-0 transition ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

export default function Input({
  error = false,
  className = '',
  ...rest
}: Props) {
  const borderClass = error
    ? 'border-error focus:border-error focus:ring-1 focus:ring-error/20'
    : 'border-border text-primary focus:border-accent focus:ring-1 focus:ring-accent/20';
  return (
    <input
      className={[baseClass, borderClass, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
