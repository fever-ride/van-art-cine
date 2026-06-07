'use client';

import type { SmartSearchFilmResult, SmartSearchResponse, SmartSearchScreeningResult } from '@/app/lib/smartSearch';
import ResultsTable from '@/components/screenings/ResultsTable';
import FilmResultCard from '@/components/smart-search/FilmResultCard';
import SmartSearchEmptyState from '@/components/smart-search/SmartSearchEmptyState';
import { toScreeningItem } from '@/components/smart-search/smartSearchMappers';

type Props = {
  readonly result: SmartSearchResponse;
  readonly savedIds?: Set<number>;
  readonly onSavedChange?: (screeningId: number, saved: boolean) => void;
};

function isFilmResultItems(
  items: SmartSearchResponse['items'],
): items is SmartSearchFilmResult[] {
  return items.length === 0 || 'showtimes' in items[0];
}

function isScreeningResultItems(
  items: SmartSearchResponse['items'],
): items is SmartSearchScreeningResult[] {
  return items.length === 0 || !('showtimes' in items[0]);
}

function resultHeading(resultType: SmartSearchResponse['result_type']): string | null {
  switch (resultType) {
    case 'film_results':
      return 'Recommended films';
    case 'person_results':
      return 'Films by this person';
    case 'film_showtimes':
      return 'Showtimes';
    case 'cinema_schedule':
      return 'Cinema schedule';
    case 'screening_results':
      return 'Matching screenings';
    default:
      return null;
  }
}

export default function SmartSearchResults({ result, savedIds, onSavedChange }: Props) {
  if (result.result_type === 'empty_with_fallback' || result.items.length === 0) {
    return <SmartSearchEmptyState result={result} />;
  }

  const heading = resultHeading(result.result_type);

  if (
    result.result_type === 'film_results' ||
    result.result_type === 'person_results' ||
    result.result_type === 'film_showtimes'
  ) {
    if (!isFilmResultItems(result.items)) return null;

    return (
      <div className="space-y-4">
        {heading && <h3 className="text-lg font-semibold text-primary">{heading}</h3>}
        {result.items.map((film) => (
          <FilmResultCard
            key={film.film_id}
            film={film}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
            showFilmHeader={result.result_type !== 'film_showtimes' || result.items.length > 1}
          />
        ))}
      </div>
    );
  }

  if (result.result_type === 'screening_results' || result.result_type === 'cinema_schedule') {
    if (!isScreeningResultItems(result.items)) return null;

    const screenings = result.items.map(toScreeningItem);

    return (
      <div className="space-y-4">
        {heading && <h3 className="text-lg font-semibold text-primary">{heading}</h3>}
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <ResultsTable
            items={screenings}
            savedIds={savedIds}
            onSavedChange={onSavedChange}
          />
        </div>
      </div>
    );
  }

  return <SmartSearchEmptyState result={result} />;
}
