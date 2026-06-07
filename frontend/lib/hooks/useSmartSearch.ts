'use client';

import { useCallback, useState } from 'react';
import {
  apiSmartSearch,
  validateSmartSearchQuery,
  type SmartSearchResponse,
} from '@/app/lib/smartSearch';

export function useSmartSearch() {
  const [result, setResult] = useState<SmartSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const search = useCallback(async (query: string) => {
    const validationMessage = validateSmartSearchQuery(query);
    if (validationMessage) {
      setValidationError(validationMessage);
      setError(null);
      setResult(null);
      setDegraded(false);
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);
    setLastQuery(query.trim());

    try {
      const { data, degraded: isDegraded } = await apiSmartSearch({ q: query });
      setResult(data);
      setDegraded(isDegraded || data.mode === 'degraded');
    } catch (e: unknown) {
      setResult(null);
      setDegraded(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setLoading(false);
    setError(null);
    setValidationError(null);
    setDegraded(false);
    setLastQuery('');
  }, []);

  return {
    result,
    loading,
    error,
    validationError,
    degraded,
    lastQuery,
    search,
    reset,
  };
}
