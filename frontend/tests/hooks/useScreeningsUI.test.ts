import { renderHook, act } from '@testing-library/react';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';

const push = jest.fn();
const replace = jest.fn();
let mockSearchParams = new URLSearchParams('');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => mockSearchParams,
}));

describe('useScreeningsUI', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    mockSearchParams = new URLSearchParams('');
  });

  test('ui reflects the current URL', () => {
    mockSearchParams = new URLSearchParams('q=Ozu&sort=title');
    const { result } = renderHook(() => useScreeningsUI());

    expect(result.current.ui.q).toBe('Ozu');
    expect(result.current.ui.sort).toBe('title');
  });

  describe('setFilters (filter sidebar / sheet / facets)', () => {
    test('pushes a URL with the merged state, keeping the current search', () => {
      mockSearchParams = new URLSearchParams('q=Ozu');
      const { result } = renderHook(() => useScreeningsUI());
      act(() => result.current.setFilters({ sort: 'title' }));

      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0][0]).toContain('q=Ozu');
      expect(push.mock.calls[0][0]).toContain('sort=title');
      expect(push.mock.calls[0][1]).toEqual({ scroll: false });
      expect(replace).not.toHaveBeenCalled();
    });

    test('function updater receives the current filter fields', () => {
      mockSearchParams = new URLSearchParams('cinema_ids=1');
      const { result } = renderHook(() => useScreeningsUI());
      act(() => result.current.setFilters((prev) => ({ cinemaIds: [...prev.cinemaIds, '2'] })));
      expect(decodeURIComponent(push.mock.calls[0][0])).toMatch(/cinema_ids=1,2|cinema_ids=1&cinema_ids=2/);
    });

    test('can never change q or view, even if passed at runtime', () => {
      mockSearchParams = new URLSearchParams('q=Ozu&view=film');
      const { result } = renderHook(() => useScreeningsUI());
      act(() =>
        // @ts-expect-error — q/view are not part of FiltersState
        result.current.setFilters({ sort: 'title', q: 'HACK', view: 'table' })
      );
      const url = push.mock.calls[0][0] as string;
      expect(url).toContain('q=Ozu');
      expect(url).not.toContain('HACK');
      expect(url).toContain('view=film');
    });

    test('drops any existing page param', () => {
      mockSearchParams = new URLSearchParams('page=3');
      const { result } = renderHook(() => useScreeningsUI());
      act(() => result.current.setFilters({ sort: 'title' }));
      expect(push.mock.calls[0][0]).not.toContain('page=');
    });
  });

  describe('setSearch (search box)', () => {
    test('replaces (no history entry) and changes only q', () => {
      mockSearchParams = new URLSearchParams('sort=title&cinema_ids=1');
      const { result } = renderHook(() => useScreeningsUI());
      act(() => result.current.setSearch('Ozu'));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      const url = replace.mock.calls[0][0] as string;
      expect(url).toContain('q=Ozu');
      expect(url).toContain('sort=title');
      expect(url).toContain('cinema_ids=1');
      expect(replace.mock.calls[0][1]).toEqual({ scroll: false });
    });

    test('clearing back to all defaults leaves just the pathname', () => {
      mockSearchParams = new URLSearchParams('q=Ozu');
      const { result } = renderHook(() => useScreeningsUI());
      act(() => result.current.setSearch(''));
      expect(replace).toHaveBeenCalledWith('/', { scroll: false });
    });
  });

  test('setView pushes only the view change', () => {
    mockSearchParams = new URLSearchParams('q=Ozu');
    const { result } = renderHook(() => useScreeningsUI());
    act(() => result.current.setView('film'));
    expect(push.mock.calls[0][0]).toContain('view=film');
    expect(push.mock.calls[0][0]).toContain('q=Ozu');
  });

  test('pending flags are separate per owner and all false at rest', () => {
    const { result } = renderHook(() => useScreeningsUI());
    expect(result.current.pending).toEqual({ search: false, filters: false, view: false, any: false });
  });

  test('defaultValues fill in fields the URL does not specify', () => {
    mockSearchParams = new URLSearchParams('');
    const { result } = renderHook(() => useScreeningsUI({ sort: 'title' }));

    expect(result.current.ui.sort).toBe('title');
  });

  test('a value present in the URL wins over defaultValues for that field', () => {
    mockSearchParams = new URLSearchParams('sort=imdb');
    const { result } = renderHook(() => useScreeningsUI({ sort: 'title' }));

    expect(result.current.ui.sort).toBe('imdb');
  });

});
