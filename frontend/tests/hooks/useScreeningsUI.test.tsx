import { renderHook, act } from '@testing-library/react';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';

describe('useScreeningsUI', () => {
  test('initializes with default state', () => {
    const { result } = renderHook(() => useScreeningsUI());

    expect(result.current.ui).toEqual({
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
    });
  });

  test('accepts default value overrides', () => {
    const { result } = renderHook(() =>
      useScreeningsUI({ mode: 'range', q: 'noir', limit: 50 })
    );

    expect(result.current.ui.mode).toBe('range');
    expect(result.current.ui.q).toBe('noir');
    expect(result.current.ui.limit).toBe(50);
    expect(result.current.ui.sort).toBe('time');
  });

  test('setUI with partial object merges into state', () => {
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'Parasite', sort: 'title' });
    });

    expect(result.current.ui.q).toBe('Parasite');
    expect(result.current.ui.sort).toBe('title');
    expect(result.current.ui.mode).toBe('single');
  });

  test('setUI with function updater replaces state', () => {
    const { result } = renderHook(() => useScreeningsUI({ limit: 20 }));

    act(() => {
      result.current.setUI((s) => ({ ...s, limit: s.limit + 10 }));
    });

    expect(result.current.ui.limit).toBe(30);
  });

  test('multiple setUI calls accumulate changes', () => {
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'test' });
    });
    act(() => {
      result.current.setUI({ cinemaIds: ['1', '2'] });
    });

    expect(result.current.ui.q).toBe('test');
    expect(result.current.ui.cinemaIds).toEqual(['1', '2']);
  });
});
