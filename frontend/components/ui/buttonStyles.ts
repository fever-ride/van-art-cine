/**
 * Shared button style utilities. This file has no 'use client' so it can be
 * imported by Server Components (e.g. about page) and Client Components (Button).
 */

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover disabled:opacity-60 disabled:hover:bg-accent',
  outline:
    'border border-border bg-surface text-primary hover:bg-surface-hover transition-colors',
  danger:
    'bg-error text-white hover:bg-error-hover disabled:opacity-60 disabled:hover:bg-error',
  ghost:
    'border border-border bg-surface text-muted hover:bg-surface-subtle hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'rounded-btn px-4 py-2 text-sm font-semibold',
  md: 'rounded-btn px-5 py-2.5 text-sm font-semibold',
  icon:
    'inline-flex h-9 w-9 items-center justify-center rounded-btn text-base',
};

/**
 * Shared class names for elements that should look like a button (e.g. Next.js Link).
 * Use with: <Link href="..." className={getButtonClassName({ variant: 'outline', size: 'sm' })}>
 * Safe to use in Server Components.
 */
export function getButtonClassName({
  variant = 'outline',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  const base =
    'inline-flex items-center justify-center font-semibold transition whitespace-nowrap shrink-0';
  return [base, variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(' ');
}
