'use client';

export default function Pagination({
  className = '',
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}: {
  readonly className?: string;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly disablePrev?: boolean;
  readonly disableNext?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={onPrev}
        disabled={disablePrev}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
      >
        Prev
      </button>
      <button
        onClick={onNext}
        disabled={disableNext}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}