'use client';

import type { SmartSearchResponse } from '@/app/lib/smartSearch';
import { SMART_SEARCH_OUT_OF_SCOPE_MESSAGE } from '@/app/lib/smartSearch';

type Props = {
  readonly result: SmartSearchResponse;
};

export default function SmartSearchEmptyState({ result }: Props) {
  const message =
    result.mode === 'unsupported'
      ? SMART_SEARCH_OUT_OF_SCOPE_MESSAGE
      : result.message || 'No results found for your search.';

  return (
    <div className="rounded-card border border-border bg-surface px-6 py-8 text-sm text-primary">
      <p>{message}</p>
      {result.fallback_available && result.fallback_hint && (
        <p className="mt-3 text-muted">{result.fallback_hint}</p>
      )}
    </div>
  );
}
