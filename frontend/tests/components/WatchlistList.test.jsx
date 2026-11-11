import { render, screen, fireEvent, within } from '@testing-library/react';
import WatchlistList from '@/components/watchlist/WatchlistList';

jest.mock('@/components/watchlist/WatchlistButton', () => ({
  __esModule: true,
  default: ({ screeningId, onChange, confirmBeforeRemove }) => (
    <button
      type="button"
      data-confirm={String(Boolean(confirmBeforeRemove))}
      onClick={() => onChange?.(false)}
    >
      Remove {screeningId}
    </button>
  ),
}));

const upcoming = {
  screening_id: 7,
  start_at_utc: '2026-11-20T03:30:00Z',
  runtime_min: 147,
  film_id: 10,
  title: 'Paris, Texas',
  year: 1984,
  imdb_rating: 8.1,
  cinema_id: 1,
  cinema_name: 'The Cinematheque',
  source_url: 'https://example.com/tickets',
  status: 'upcoming',
};
const gone = {
  screening_id: 8,
  start_at_utc: null,
  film_id: null,
  title: '(no longer available)',
  cinema_id: null,
  cinema_name: null,
  status: 'unavailable',
};

describe('WatchlistList', () => {
  test('shows the same fields as before: when, title, IMDb, cinema, status, tickets', () => {
    render(<WatchlistList items={[upcoming, gone]} onSavedChange={() => {}} />);
    const [row, goneRow] = screen.getAllByRole('listitem');

    expect(row).toHaveTextContent('8:30 PM');
    expect(row).toHaveTextContent('147 min');
    expect(within(row).getByRole('link', { name: 'Paris, Texas (1984)' })).toHaveAttribute('href', '/films/10');
    expect(row).toHaveTextContent('IMDb 8.1');
    expect(row).toHaveTextContent('The Cinematheque');
    expect(row).toHaveTextContent('Upcoming');
    expect(within(row).getByRole('link', { name: 'Get tickets' })).toHaveAttribute('href', upcoming.source_url);

    expect(goneRow).toHaveTextContent('—');
    expect(goneRow).toHaveTextContent('Unavailable');
    expect(goneRow).toHaveTextContent('No ticket link');
    expect(within(goneRow).queryByRole('link', { name: /no longer available/i })).toBeNull();
  });

  test('remove asks for confirmation and reports the change', () => {
    const onSavedChange = jest.fn();
    render(<WatchlistList items={[upcoming]} onSavedChange={onSavedChange} />);
    const btn = screen.getByRole('button', { name: 'Remove 7' });
    expect(btn).toHaveAttribute('data-confirm', 'true');
    fireEvent.click(btn);
    expect(onSavedChange).toHaveBeenCalledWith(7, false);
  });

  test('has no column-header row (removed by decision)', () => {
    render(<WatchlistList items={[upcoming]} onSavedChange={() => {}} />);
    for (const label of ['When', 'Film', 'Cinema', 'Status']) {
      expect(screen.queryByText(label, { exact: true })).toBeNull();
    }
  });
});
