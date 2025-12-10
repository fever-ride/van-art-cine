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

    // Header text
    expect(
      screen.getByText(/Upcoming Screenings of/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/My Film in Vancouver/i)
    ).toBeInTheDocument();

    // Cinema name
    expect(screen.getByText('Test Cinema')).toBeInTheDocument();

    // Ticket link
    const ticketLink = screen.getByText('Get tickets on cinema site!');
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

  test('limits to 10 screenings by default and shows "Show more" when there are more', () => {
    const screenings = Array.from({ length: 12 }, (_, i) =>
      makeScreening({
        id: i + 1,
        cinema_name: `Cinema ${i + 1}`,
        start_at_utc: `2025-01-${String(i + 1).padStart(2, '0')}T20:00:00Z`,
      })
    );

    render(<FilmShowtimes upcoming={screenings} filmTitle="Many Shows" />);

    // Only 10 visible list items at first
    expect(screen.getAllByRole('listitem')).toHaveLength(10);

    // Button text includes "(2 more)"
    const button = screen.getByRole('button', {
      name: /Show more \(2 more\)/i,
    });
    expect(button).toBeInTheDocument();

    // After clicking, all 12 should be visible and button becomes "Show less"
    fireEvent.click(button);

    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(
      screen.getByRole('button', { name: /Show less/i })
    ).toBeInTheDocument();
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