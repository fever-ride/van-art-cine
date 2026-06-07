import { renderHook, act, waitFor } from '@testing-library/react';
import { useSmartSearch } from '@/lib/hooks/useSmartSearch';

const mockApiSmartSearch = jest.fn();

jest.mock('@/app/lib/smartSearch', () => ({
  ...jest.requireActual('@/app/lib/smartSearch'),
  apiSmartSearch: (...args: unknown[]) => mockApiSmartSearch(...args),
}));

describe('useSmartSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects empty query without calling API', async () => {
    const { result } = renderHook(() => useSmartSearch());

    await act(async () => {
      await result.current.search('   ');
    });

    expect(mockApiSmartSearch).not.toHaveBeenCalled();
    expect(result.current.validationError).toContain('Enter a search');
    expect(result.current.result).toBeNull();
  });

  test('rejects overly long query without calling API', async () => {
    const { result } = renderHook(() => useSmartSearch());
    const longQuery = 'a'.repeat(501);

    await act(async () => {
      await result.current.search(longQuery);
    });

    expect(mockApiSmartSearch).not.toHaveBeenCalled();
    expect(result.current.validationError).toContain('Please shorten your search');
  });

  test('loads smart search results and tracks degraded mode', async () => {
    mockApiSmartSearch.mockResolvedValue({
      degraded: true,
      data: {
        mode: 'degraded',
        intent_type: null,
        result_type: 'screening_results',
        items: [{ id: 1, title: 'Nosferatu', film_id: 2, cinema_id: 3, cinema_name: 'Rio', start_at_utc: '2026-06-07T03:00:00.000Z' }],
      },
    });

    const { result } = renderHook(() => useSmartSearch());

    await act(async () => {
      await result.current.search('nosferatu');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiSmartSearch).toHaveBeenCalledWith({ q: 'nosferatu' });
    expect(result.current.result?.result_type).toBe('screening_results');
    expect(result.current.degraded).toBe(true);
    expect(result.current.lastQuery).toBe('nosferatu');
  });

  test('sets error when API call fails', async () => {
    mockApiSmartSearch.mockRejectedValue(new Error('Smart Search is temporarily unavailable. Please try again later.'));

    const { result } = renderHook(() => useSmartSearch());

    await act(async () => {
      await result.current.search('dreamy romance');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('temporarily unavailable');
    expect(result.current.result).toBeNull();
  });
});
