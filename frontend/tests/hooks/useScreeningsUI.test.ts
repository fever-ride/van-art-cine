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

  test('setUI with a patch pushes a URL reflecting the merged state, not just the patch', () => {
    mockSearchParams = new URLSearchParams('q=Ozu');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ sort: 'title' });
    });

    expect(push).toHaveBeenCalledTimes(1);
    const pushedUrl = push.mock.calls[0][0];
    expect(pushedUrl).toContain('q=Ozu');
    expect(pushedUrl).toContain('sort=title');
  });

  test('setUI with a function updater receives the current ui to update from', () => {
    mockSearchParams = new URLSearchParams('cinema_ids=3');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI((prev) => ({
        ...prev,
        cinemaIds: [...prev.cinemaIds, '5'],
      }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain('cinema_ids=3%2C5');
  });

  test('setUI back to all default values pushes just the pathname, no query string', () => {
    mockSearchParams = new URLSearchParams('q=Ozu');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: '' });
    });

    expect(push).toHaveBeenCalledWith('/', { scroll: false });
  });

  test('setUI drops any existing page param, resetting pagination on a filter change', () => {
    mockSearchParams = new URLSearchParams('page=3');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'Ozu' });
    });

    expect(push.mock.calls[0][0]).not.toContain('page=');
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

  test('setUI with { replace: true } uses router.replace instead of push', () => {
    mockSearchParams = new URLSearchParams('');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'Ozu' }, { replace: true });
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('q=Ozu');
    expect(replace.mock.calls[0][1]).toEqual({ scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  test('setUI never lets the navigation scroll back to the top of the page', () => {
    mockSearchParams = new URLSearchParams('');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'Ozu' });
    });

    expect(push.mock.calls[0][1]).toEqual({ scroll: false });
  });

  test('setUI without options still pushes, so it stays back-button-able', () => {
    mockSearchParams = new URLSearchParams('');
    const { result } = renderHook(() => useScreeningsUI());

    act(() => {
      result.current.setUI({ q: 'Ozu' });
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
});
