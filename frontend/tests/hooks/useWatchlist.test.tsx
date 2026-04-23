import { renderHook, act, waitFor } from '@testing-library/react';
import { useWatchlist } from '@/lib/hooks/useWatchlist';

const mockGetGuestSet = jest.fn();
const mockApiListWatchlist = jest.fn();

jest.mock('@/app/lib/guestWatchlist', () => ({
  GUEST_KEY: 'guest_watchlist',
  getGuestSet: () => mockGetGuestSet(),
}));

jest.mock('@/app/lib/watchlist', () => ({
  apiListWatchlist: (...args: unknown[]) => mockApiListWatchlist(...args),
}));

describe('useWatchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGuestSet.mockReturnValue(new Set<number>());
    mockApiListWatchlist.mockRejectedValue(new Error('Not authed'));
  });

  test('initializes from guest storage', async () => {
    mockGetGuestSet.mockReturnValue(new Set([1, 2, 3]));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(result.current.savedIds.size).toBeGreaterThanOrEqual(0);
    });

    expect(mockGetGuestSet).toHaveBeenCalled();
  });

  test('loads authenticated watchlist and replaces guest set', async () => {
    mockGetGuestSet.mockReturnValue(new Set([99]));
    mockApiListWatchlist.mockResolvedValue({
      items: [{ screening_id: 10 }, { screening_id: 20 }],
    });

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(result.current.savedIds.has(10)).toBe(true);
    });

    expect(result.current.savedIds.has(20)).toBe(true);
    expect(result.current.savedIds.has(99)).toBe(false);
  });

  test('keeps guest set when API fails', async () => {
    mockGetGuestSet.mockReturnValue(new Set([5]));
    mockApiListWatchlist.mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(mockApiListWatchlist).toHaveBeenCalled();
    });

    expect(result.current.savedIds.has(5)).toBe(true);
  });

  test('handleSavedChange adds an id', async () => {
    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(mockApiListWatchlist).toHaveBeenCalled();
    });

    act(() => {
      result.current.handleSavedChange(42, true);
    });

    expect(result.current.savedIds.has(42)).toBe(true);
  });

  test('handleSavedChange removes an id', async () => {
    mockGetGuestSet.mockReturnValue(new Set([42]));
    mockApiListWatchlist.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(result.current.savedIds.has(42)).toBe(true);
    });

    act(() => {
      result.current.handleSavedChange(42, false);
    });

    expect(result.current.savedIds.has(42)).toBe(false);
  });
});
