'use client';

import type { ButtonHTMLAttributes } from 'react';
import { getButtonClassName, type ButtonVariant, type ButtonSize } from './buttonStyles';

export type { ButtonVariant, ButtonSize };

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  type,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      className={[
        getButtonClassName({ variant, size }),
        disabled && size !== 'icon' ? 'disabled:cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
