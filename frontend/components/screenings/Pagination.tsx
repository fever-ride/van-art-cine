'use client';

import { Button } from '@/components/ui';

type PaginationProps = {
  readonly className?: string;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly disablePrev?: boolean;
  readonly disableNext?: boolean;
};

export default function Pagination({
  className = '',
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}: PaginationProps) {
  return (
    <div
      className={`mt-6 flex w-full items-center justify-center gap-4 ${className}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.currentTarget.blur();
          onPrev();
        }}
        disabled={disablePrev}
        aria-label="Previous page"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M11.5 4.5 7 10l4.5 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.currentTarget.blur();
          onNext();
        }}
        disabled={disableNext}
        aria-label="Next page"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M8.5 4.5 13 10l-4.5 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
    </div>
  );
}