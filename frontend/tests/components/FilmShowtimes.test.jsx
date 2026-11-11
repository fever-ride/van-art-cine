import { render, screen, fireEvent } from '@testing-library/react';
import FilmShowtimes from '@/components/films/FilmShowtimes';

// Mock useWatchlist hook
jest.mock('@/lib/hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    savedIds: new Set(),
    handleSavedChange: jest.fn(),
  }),
}));

// Mock WatchlistButton
jest.mock('@/components/watchlist/WatchlistButton', () => {
  return function MockWatchlistButton(props) {
    const { screeningId, initialSaved, onChange, ...rest } = props;
    return (
      <button
        data-testid={`watchlist-${screeningId}`}
        data-initial-saved={initialSaved ? 'true' : 'false'}
        onClick={() => onChange && onChange(!initialSaved)}
        {...rest}
      >
        Watchlist
      </button>
    );
  };
});

function makeScreening(overrides = {}) {
  const base = {
    id: 1,
    title: 'Test Film',
    start_at_utc: '2025-01-01T20:00:00Z',
    end_at_utc: null,
    runtime_min: 120,
    cinema_id: 10,
    cinema_name: 'Test Cinema',
    source_url: 'https://example.com/tickets',
  };
  return { ...base, ...overrides };
}

describe('FilmShowtimes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders fallback message when there are no upcoming screenings', () => {
    render(<FilmShowtimes upcoming={[]} filmTitle="My Film" />);

    expect(
      screen.getByText('No upcoming screenings.')
    ).toBeInTheDocument();
  });

  test('renders header with film title and a single screening row', () => {
    const screenings = [makeScreening({ id: 1 })];

    render(<FilmShowtimes upcoming={screenings} filmTitle="My Film" />);

    // Header text. The heading is a static, film-agnostic label; the
    // `filmTitle` prop is accepted but no longer rendered into it.
    expect(
      screen.getByText(/Upcoming Screenings in Vancouver/i)
    ).toBeInTheDocument();

    // Cinema name
    expect(screen.getByText('Test Cinema')).toBeInTheDocument();

    // Ticket link
    const ticketLink = screen.getByRole('link', { name: /Get tickets/ });
    expect(ticketLink).toBeInTheDocument();
    expect(ticketLink).toHaveAttribute(
      'href',
      'https://example.com/tickets'
    );

    // Watchlist button from the mock
    expect(
      screen.getByTestId('watchlist-1')
    ).toBeInTheDocument();
  });

  test('shows "No ticket link" when source_url is missing', () => {
    const screenings = [makeScreening({ id: 2, source_url: null })];

    render(<FilmShowtimes upcoming={screenings} filmTitle="Another Film" />);

    expect(screen.getByText('No ticket link')).toBeInTheDocument();
  });

  test('folds after 8 rows, soonest first, with Show all / Show fewer', () => {
    const screenings = Array.from({ length: 12 }, (_, i) =>
      makeScreening({ id: i + 1, start_at_utc: `2025-01-${String(12 - i).padStart(2, '0')}T20:00:00Z` }),
    );
    render(<FilmShowtimes upcoming={screenings} filmTitle="Many Shows" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    const more = screen.getByRole('button', { name: 'Show all 12 screenings' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  test('each row shows the date under the time, like the homepage list', () => {
    render(<FilmShowtimes upcoming={[makeScreening({ id: 1, start_at_utc: '2025-01-01T20:00:00Z' })]} />);
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('12:00 PM');
    expect(row).toHaveTextContent('Wed, Jan 1');
  });

  test('no fold button when everything fits', () => {
    render(<FilmShowtimes upcoming={[makeScreening({ id: 1 }), makeScreening({ id: 2 })]} />);
    expect(screen.queryByRole('button', { name: /Show all|Show fewer/ })).toBeNull();
  });

  test('summary counts screenings and cinemas', () => {
    const screenings = [
      makeScreening({ id: 1 }),
      makeScreening({ id: 2, cinema_id: 11, cinema_name: 'Rio Theatre' }),
      makeScreening({ id: 3, cinema_id: 11, cinema_name: 'Rio Theatre' }),
    ];
    render(<FilmShowtimes upcoming={screenings} />);
    expect(screen.getByText('3 screenings · 2 cinemas')).toBeInTheDocument();
  });

  test('cinema filter: only shown for 2+ cinemas, narrows the rows, All resets', () => {
    const screenings = [
      makeScreening({ id: 1 }),
      makeScreening({ id: 2, cinema_id: 11, cinema_name: 'Rio Theatre' }),
      makeScreening({ id: 3, cinema_id: 11, cinema_name: 'Rio Theatre' }),
    ];
    render(<FilmShowtimes upcoming={screenings} />);
    const group = screen.getByRole('group', { name: 'Filter by cinema' });
    expect(group).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rio Theatre' }));
    expect(screen.getByRole('button', { name: 'Rio Theatre' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  test('no cinema filter for a single cinema', () => {
    render(<FilmShowtimes upcoming={[makeScreening({ id: 1 }), makeScreening({ id: 2 })]} />);
    expect(screen.queryByRole('group', { name: 'Filter by cinema' })).toBeNull();
  });

  test('shows start time only — no end time or runtime (data not reliable enough)', () => {
    render(
      <FilmShowtimes
        upcoming={[makeScreening({ id: 1, start_at_utc: '2025-01-01T20:00:00Z', end_at_utc: '2025-01-01T23:30:00Z', runtime_min: 120 })]}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('12:00 PM'); // 20:00Z = noon Vancouver (PST)
    expect(row).not.toHaveTextContent('3:30 PM');
    expect(row).not.toHaveTextContent('120 min');
  });

  test('no column header row', () => {
    render(<FilmShowtimes upcoming={[makeScreening({ id: 1 })]} />);
    expect(screen.queryByText('When')).toBeNull();
  });

  test('sorts screenings by start_at_utc ascending', () => {
    const screenings = [
      makeScreening({
        id: 1,
        cinema_name: 'Later Cinema',
        start_at_utc: '2025-01-02T20:00:00Z',
      }),
      makeScreening({
        id: 2,
        cinema_name: 'Earlier Cinema',
        start_at_utc: '2025-01-01T20:00:00Z',
      }),
    ];

    render(<FilmShowtimes upcoming={screenings} filmTitle="Sorted Film" />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Earlier Cinema');
    expect(items[1]).toHaveTextContent('Later Cinema');
  });
});