'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { useSmartSearch } from '@/lib/hooks/useSmartSearch';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import SmartSearchResults from '@/components/smart-search/SmartSearchResults';
import {
  SMART_SEARCH_DEGRADED_NOTICE,
  SMART_SEARCH_MAX_QUERY_LENGTH,
} from '@/app/lib/smartSearch';

const PLACEHOLDER_EXAMPLES = [
  'light comedy tonight under 2 hours',
  'dreamy melancholic romance',
  "what's at the Rio tonight",
  'Wong Kar-wai style',
];

export default function SmartSearchSection() {
  const [query, setQuery] = useState('');
  const smartSearch = useSmartSearch();
  const watchlist = useWatchlist();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void smartSearch.search(query);
  };

  const inputError = Boolean(smartSearch.validationError);
  const placeholder = PLACEHOLDER_EXAMPLES[0];

  return (
    <section
      aria-labelledby="smart-search-heading"
      className="mt-16 border-t border-border pt-12"
    >
      <div className="mb-6">
        <h2 id="smart-search-heading" className="text-2xl font-bold text-primary">
          Smart Search
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Looking for something specific? Describe the kind of film you want to watch.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            maxLength={SMART_SEARCH_MAX_QUERY_LENGTH}
            aria-label="Describe the kind of film you want"
            error={inputError}
            disabled={smartSearch.loading}
            className="md:flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={smartSearch.loading}
            className="md:w-auto"
          >
            {smartSearch.loading ? 'Searching…' : 'Search'}
          </Button>
        </div>

        {smartSearch.validationError && (
          <p className="text-sm text-error" role="alert">
            {smartSearch.validationError}
          </p>
        )}
      </form>

      <div className="mt-6 space-y-4">
        {smartSearch.loading && (
          <p className="text-sm text-muted">Finding screenings that might fit…</p>
        )}

        {smartSearch.error && (
          <p className="text-sm text-error" role="alert">
            {smartSearch.error}
          </p>
        )}

        {smartSearch.degraded && !smartSearch.error && (
          <p className="rounded-card border border-border bg-surface-subtle px-4 py-3 text-sm text-muted">
            {SMART_SEARCH_DEGRADED_NOTICE}
          </p>
        )}

        {!smartSearch.loading && smartSearch.result && (
          <SmartSearchResults
            result={smartSearch.result}
            savedIds={watchlist.savedIds}
            onSavedChange={watchlist.handleSavedChange}
          />
        )}
      </div>
    </section>
  );
}
