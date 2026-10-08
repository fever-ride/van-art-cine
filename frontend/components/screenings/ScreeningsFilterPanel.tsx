'use client';

import { useState } from 'react';
import { Archivo, Hanken_Grotesk } from 'next/font/google';
import type { UIState, SetUI } from '@/lib/hooks/useScreeningsUI';
import type { ScreeningFacets, ScreeningFacetValue } from '@/app/lib/screenings';

const archivo = Archivo({ subsets: ['latin'], weight: ['700'], display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

const VISIBLE_COUNT = 5;

type Props = {
  ui: UIState;
  setUI: SetUI;
  facets: ScreeningFacets;
};

/** Collapsible facet filter panel for the Film view, modeled on a festival
 * site's own filter UI (see chat history for the reference) — a Filter
 * toggle button that expands a panel of checkbox columns, each value's
 * count shown in parens, with a "see more" to reveal the long tail.
 * Table view keeps its own existing `Filters` sidebar untouched; this is
 * additive, not a replacement. */
export default function ScreeningsFilterPanel({ ui, setUI, facets }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`${hanken.className} mb-6`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-btn border border-primary bg-surface px-3.5 py-2 text-sm font-semibold text-primary"
      >
        Filter
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-7 rounded-b-card border border-t-0 border-border p-5 sm:grid-cols-3">
          <FacetColumn
            title="Cinemas"
            values={facets.cinemas.map((c) => ({ name: c.name, count: c.count }))}
            selected={ui.cinemaIds}
            onToggle={(name, checked) => {
              const id = facets.cinemas.find((c) => c.name === name)?.id;
              if (id == null) return;
              const idStr = String(id);
              const next = checked
                ? [...ui.cinemaIds, idStr]
                : ui.cinemaIds.filter((v) => v !== idStr);
              setUI({ cinemaIds: next });
            }}
            isSelected={(name) => {
              const id = facets.cinemas.find((c) => c.name === name)?.id;
              return id != null && ui.cinemaIds.includes(String(id));
            }}
          />
          <FacetColumn
            title="Genre"
            values={facets.genres}
            selected={ui.genreValues}
            onToggle={(name, checked) => {
              const next = checked
                ? [...ui.genreValues, name]
                : ui.genreValues.filter((v) => v !== name);
              setUI({ genreValues: next });
            }}
            isSelected={(name) => ui.genreValues.includes(name)}
          />
          <FacetColumn
            title="Language"
            values={facets.languages}
            selected={ui.languageValues}
            onToggle={(name, checked) => {
              const next = checked
                ? [...ui.languageValues, name]
                : ui.languageValues.filter((v) => v !== name);
              setUI({ languageValues: next });
            }}
            isSelected={(name) => ui.languageValues.includes(name)}
          />
        </div>
      )}
    </div>
  );
}

function FacetColumn({
  title,
  values,
  isSelected,
  onToggle,
}: {
  title: string;
  values: ScreeningFacetValue[];
  selected: string[];
  isSelected: (name: string) => boolean;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? values : values.slice(0, VISIBLE_COUNT);
  const hiddenCount = values.length - VISIBLE_COUNT;

  const options = visible.map((v) => (
    <label key={v.name} className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-primary">
      <input
        type="checkbox"
        className="accent-accent"
        checked={isSelected(v.name)}
        onChange={(e) => onToggle(v.name, e.target.checked)}
      />
      {v.name} ({v.count})
    </label>
  ));

  return (
    <div>
      <h3 className={`${archivo.className} mb-3 text-[11px] uppercase tracking-wide text-muted`}>
        {title}
      </h3>
      {/* Once expanded, a long tail (language in particular can run past 30
       * values) scrolls in place instead of stretching this column far
       * past its siblings — same fix already used for Table view's own
       * cinema checklist (Filters.tsx's cinemaListRef). */}
      {expanded ? (
        <div className="max-h-[220px] overflow-y-auto pr-1">{options}</div>
      ) : (
        options
      )}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-semibold text-accent underline"
        >
          See more ({hiddenCount} more)
        </button>
      )}
    </div>
  );
}
