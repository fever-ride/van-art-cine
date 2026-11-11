import { render, screen, fireEvent, within } from '@testing-library/react';
import ScreeningList from '@/components/screenings/ScreeningList';

// The watchlist button has its own tests; here we only need a clickable stub.
jest.mock('@/components/watchlist/WatchlistButton', () => ({
  __esModule: true,
  default: ({ screeningId, onChange }) => (
    <button type="button" onClick={() => onChange?.(true)}>
      Add to Watchlist {screeningId}
    </button>
  ),
}));

const base = {
  id: 1,
  film_id: 10,
  title: 'Paris, Texas',
  year: 1984,
  directors: ['Wim Wenders'],
  genre: ['Drama'],
  cinema_name: 'The Cinematheque',
  start_at_utc: '2026-11-20T03:30:00Z',
  end_at_utc: '2026-11-20T06:00:00Z',
  runtime_min: 147,
  description: 'A drifter walks out of the desert.',
  imdb_rating: 8.1,
  imdb_votes: 120000,
  rt_rating_pct: 95,
  rated: 'R',
  source_url: 'https://example.com/tickets',
  imdb_url: 'https://www.imdb.com/title/tt0087884/',
};

const items = [base, { ...base, id: 2, film_id: null, title: 'Untitled Short', year: null }];

const rowOf = (title) => screen.getByText(title, { exact: false }).closest('li');

describe('ScreeningList', () => {
  test('renders every screening with title, year, cinema and time', () => {
    render(<ScreeningList items={items} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const row = rowOf('Paris, Texas');
    expect(within(row).getByRole('link', { name: /paris, texas/i })).toHaveAttribute('href', '/films/10');
    expect(row).toHaveTextContent('(1984)');
    expect(row).toHaveTextContent('Wim Wenders');
    expect(row).toHaveTextContent('The Cinematheque');
    // 03:30Z = 8:30 PM: BC is on permanent UTC-7 after 2026-11-01
    // (TROUBLESHOOTING.md → "Showtimes off by one hour").
    expect(row).toHaveTextContent('8:30 PM');
    expect(row).toHaveTextContent('147 min');
  });

  test('a screening without film_id shows its title as plain text', () => {
    render(<ScreeningList items={items} />);
    const row = rowOf('Untitled Short');
    expect(within(row).queryByRole('link', { name: /untitled short/i })).toBeNull();
  });

  test('details are hidden until the row is clicked', () => {
    render(<ScreeningList items={items} />);
    expect(screen.queryByText('View on cinema site')).toBeNull();

    fireEvent.click(within(rowOf('Paris, Texas')).getByText('The Cinematheque'));

    expect(screen.getByText('View on cinema site')).toHaveAttribute('href', base.source_url);
    expect(screen.getByText('A drifter walks out of the desert.')).toBeInTheDocument();
    // only that row opened
    expect(screen.getAllByText('View on cinema site')).toHaveLength(1);
  });

  test('toggle buttons expose aria-expanded and collapse again', () => {
    render(<ScreeningList items={[base]} />);
    const toggle = screen.getByRole('button', { name: /show details for paris, texas/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /hide details for paris, texas/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.queryByText('View on cinema site')).toBeNull();
  });

  test('clicking the watchlist button or title link does not expand the row', () => {
    const onSavedChange = jest.fn();
    render(<ScreeningList items={[base]} onSavedChange={onSavedChange} />);

    fireEvent.click(screen.getByRole('button', { name: /add to watchlist 1/i }));
    fireEvent.click(screen.getByRole('link', { name: /paris, texas/i }));

    expect(onSavedChange).toHaveBeenCalledWith(1, true);
    expect(screen.queryByText('View on cinema site')).toBeNull();
  });

  test('has no column-header row (removed by decision)', () => {
    render(<ScreeningList items={items} />);
    for (const label of ['When', 'Film', 'Cinema', 'Status']) {
      expect(screen.queryByText(label, { exact: true })).toBeNull();
    }
  });
});
