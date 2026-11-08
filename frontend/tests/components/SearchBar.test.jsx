import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar, { SEARCH_DEBOUNCE_MS } from '@/components/screenings/SearchBar';

describe('SearchBar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('debounces typing into one setUI({ q }, { replace: true }), calling onBeforeCommit first', () => {
    const setUI = jest.fn();
    const onBeforeCommit = jest.fn();
    render(<SearchBar q="" setUI={setUI} onBeforeCommit={onBeforeCommit} />);

    const input = screen.getByRole('searchbox', { name: 'Search films' });
    fireEvent.change(input, { target: { value: 'O' } });
    fireEvent.change(input, { target: { value: 'Ozu' } });
    expect(setUI).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(setUI).toHaveBeenCalledTimes(1);
    expect(setUI).toHaveBeenCalledWith({ q: 'Ozu' }, { replace: true });
    expect(onBeforeCommit).toHaveBeenCalledTimes(1);
    expect(onBeforeCommit.mock.invocationCallOrder[0]).toBeLessThan(setUI.mock.invocationCallOrder[0]);
  });

  test('works without onBeforeCommit (Movies view)', () => {
    const setUI = jest.fn();
    render(<SearchBar q="" setUI={setUI} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Varda' } });
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(setUI).toHaveBeenCalledWith({ q: 'Varda' }, { replace: true });
  });

  test('follows external q changes (e.g. browser back)', () => {
    const { rerender } = render(<SearchBar q="old" setUI={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('old');
    rerender(<SearchBar q="new" setUI={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('new');
  });
});
