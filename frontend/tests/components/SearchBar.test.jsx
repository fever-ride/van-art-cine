import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchBar, { SEARCH_DEBOUNCE_MS } from '@/components/screenings/SearchBar';

describe('SearchBar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('debounces typing into one setSearch(q), calling onBeforeCommit first', () => {
    const setSearch = jest.fn();
    const onBeforeCommit = jest.fn();
    render(<SearchBar q="" setSearch={setSearch} onBeforeCommit={onBeforeCommit} />);

    const input = screen.getByRole('searchbox', { name: 'Search films' });
    fireEvent.change(input, { target: { value: 'O' } });
    fireEvent.change(input, { target: { value: 'Ozu' } });
    expect(setSearch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(setSearch).toHaveBeenCalledTimes(1);
    expect(setSearch).toHaveBeenCalledWith('Ozu');
    expect(onBeforeCommit).toHaveBeenCalledTimes(1);
    expect(onBeforeCommit.mock.invocationCallOrder[0]).toBeLessThan(setSearch.mock.invocationCallOrder[0]);
  });

  test('works without onBeforeCommit (Movies view)', () => {
    const setSearch = jest.fn();
    render(<SearchBar q="" setSearch={setSearch} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Varda' } });
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(setSearch).toHaveBeenCalledWith('Varda');
  });

  test('follows external q changes (e.g. browser back)', () => {
    const { rerender } = render(<SearchBar q="old" setSearch={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('old');
    rerender(<SearchBar q="new" setSearch={jest.fn()} />);
    expect(screen.getByRole('searchbox')).toHaveValue('new');
  });

  test('spinner shows exactly while its own pending flag (pending.search) is true', () => {
    const spinner = (c) => c.querySelector('.animate-spin');
    const { container, rerender } = render(<SearchBar q="" setSearch={jest.fn()} pending={false} />);
    expect(spinner(container)).toBeNull();
    rerender(<SearchBar q="" setSearch={jest.fn()} pending={true} />);
    expect(spinner(container)).not.toBeNull();
  });
});
