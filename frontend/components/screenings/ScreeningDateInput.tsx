'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import 'react-day-picker/style.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
};

type PopoverPosition = {
  top: number;
  left: number;
  width: number;
};

function parseYmd(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const POPOVER_ESTIMATED_HEIGHT = 340;
const POPOVER_ESTIMATED_WIDTH = 280;

export default function ScreeningDateInput({
  value,
  onChange,
  min,
  placeholder = 'Select date',
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({
    top: 0,
    left: 0,
    width: 0,
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = parseYmd(value);
  const minDate = parseYmd(min ?? '');
  const defaultMonth = selected ?? minDate ?? new Date();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const fitsBelow =
        rect.bottom + POPOVER_ESTIMATED_HEIGHT <= window.innerHeight - 8;
      const top = fitsBelow
        ? rect.bottom + 6
        : Math.max(8, rect.top - POPOVER_ESTIMATED_HEIGHT - 6);

      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - POPOVER_ESTIMATED_WIDTH - 8)
      );

      setPosition({
        top,
        left,
        width: Math.max(rect.width, POPOVER_ESTIMATED_WIDTH),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const label = selected ? format(selected, 'MMM d, yyyy') : placeholder;

  const popover =
    open && mounted ? (
      <div
        id={listboxId}
        ref={popoverRef}
        role="dialog"
        aria-label="Choose date"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          minWidth: position.width,
          zIndex: 1000,
        }}
        className="rounded-card border border-border bg-surface p-2 shadow-[0_12px_28px_rgba(0,0,0,0.12)]"
      >
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={defaultMonth}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
            buttonRef.current?.blur();
          }}
          disabled={minDate ? { before: minDate } : undefined}
          showOutsideDays={false}
          classNames={{
            today: 'font-semibold text-accent',
            selected: 'bg-accent text-white',
            disabled: 'text-disabled opacity-50',
          }}
        />
      </div>
    ) : null;

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'flex w-full items-center justify-between rounded-input border bg-surface px-3 py-2.5 text-left text-[15px] leading-6 transition',
          'border-border text-primary hover:border-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20',
          !selected ? 'text-muted' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-muted"
          aria-hidden="true"
        >
          <path
            d="M6 3v2M14 3v2M4.5 7h11M5 5h10a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 15 17H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {mounted && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
