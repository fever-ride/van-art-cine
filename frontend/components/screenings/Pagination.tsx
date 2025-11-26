'use client';

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
  const baseBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-base text-[#4b5563] shadow-sm transition-colors ' +
    'hover:bg-highlight hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-[#4b5563]';

  return (
    <div
      className={`mt-6 flex w-full items-center justify-center gap-4 ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={disablePrev}
        aria-label="Previous page"
        className={baseBtn}
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
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={disableNext}
        aria-label="Next page"
        className={baseBtn}
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
      </button>
    </div>
  );
}