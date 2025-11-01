'use client';

import { useState, useCallback } from 'react';

export function usePagination(limit: number) {
  const [offset, setOffset] = useState(0);

  const prevPage = useCallback(() => 
    setOffset(current => Math.max(0, current - limit)),
    [limit]
  );

  const nextPage = useCallback(() => 
    setOffset(current => current + limit),
    [limit]
  );

  const resetPagination = useCallback(() => 
    setOffset(0),
    []
  );

  return {
    offset,
    prevPage,
    nextPage,
    resetPagination,
    canGoPrev: offset > 0
  };
}