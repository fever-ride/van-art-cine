import { renderHook, waitFor } from '@testing-library/react';
import { useScreeningsData } from '@/lib/hooks/useScreeningsData';
import type { UIState } from '@/lib/hooks/useScreeningsUI';

const mockGetScreenings = jest.fn();

jest.mock('@/app/lib/screenings', () => ({
  getScreenings: (...args: unknown[]) => mockGetScreenings(...args),
}));

function makeUI(overrides: Partial<UIState> = {}): UIState {
  return {
    mode: 'single',
    date: '',
    from: '',
    to: '',
    q: '',
    cinemaIds: [],
    filmId: '',
    sort: 'time',
    order: 'asc',
    limit: 20,
    ...overrides,
  };
}

describe('useScreeningsData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches screenings on mount and returns items', async () => {
    const items = [{ id: 1, title: 'Film A' }];
    mockGetScreenings.mockResolvedValue({ items });

    const { result } = renderHook(() => useScreeningsData(makeUI()));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual(items);
    expect(result.current.error).toBeNull();
    expect(mockGetScreenings).toHaveBeenCalled();
  });

  test('sets error when API call fails', async () => {
    mockGetScreenings.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useScreeningsData(makeUI()));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.items).toEqual([]);
  });

  test('sets error for invalid date range (from > to)', async () => {
    const ui = makeUI({ mode: 'range', from: '2025-06-10', to: '2025-06-01' });

    const { result } = renderHook(() => useScreeningsData(ui));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('"From" date must be before');
    expect(mockGetScreenings).not.toHaveBeenCalled();
  });

  test('hasMore is true when items.length equals limit', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    mockGetScreenings.mockResolvedValue({ items });

    const { result } = renderHook(() => useScreeningsData(makeUI({ limit: 20 })));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
  });

  test('hasMore is false when items.length < limit', async () => {
    mockGetScreenings.mockResolvedValue({ items: [{ id: 1 }] });

    const { result } = renderHook(() => useScreeningsData(makeUI({ limit: 20 })));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  test('passes single date param in single mode', async () => {
    mockGetScreenings.mockResolvedValue({ items: [] });

    const ui = makeUI({ mode: 'single', date: '2025-06-15' });
    renderHook(() => useScreeningsData(ui));

    await waitFor(() => {
      expect(mockGetScreenings).toHaveBeenCalled();
    });

    const params = mockGetScreenings.mock.calls[0][0];
    expect(params.date).toBe('2025-06-15');
    expect(params.from).toBeUndefined();
    expect(params.to).toBeUndefined();
  });

  test('passes from/to params in range mode', async () => {
    mockGetScreenings.mockResolvedValue({ items: [] });

    const ui = makeUI({ mode: 'range', from: '2025-06-01', to: '2025-06-30' });
    renderHook(() => useScreeningsData(ui));

    await waitFor(() => {
      expect(mockGetScreenings).toHaveBeenCalled();
    });

    const params = mockGetScreenings.mock.calls[0][0];
    expect(params.from).toBe('2025-06-01');
    expect(params.to).toBe('2025-06-30');
    expect(params.date).toBeUndefined();
  });
});
