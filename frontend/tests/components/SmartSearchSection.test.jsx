import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SmartSearchSection from '@/components/smart-search/SmartSearchSection';

const mockSearch = jest.fn();
const mockUseSmartSearch = jest.fn();

jest.mock('@/lib/hooks/useSmartSearch', () => ({
  useSmartSearch: () => mockUseSmartSearch(),
}));

jest.mock('@/lib/hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    savedIds: new Set(),
    handleSavedChange: jest.fn(),
  }),
}));

function makeHookState(overrides = {}) {
  return {
    result: null,
    loading: false,
    error: null,
    validationError: null,
    degraded: false,
    lastQuery: '',
    search: mockSearch,
    reset: jest.fn(),
    ...overrides,
  };
}

describe('SmartSearchSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSmartSearch.mockReturnValue(makeHookState());
  });

  test('renders smart search section and submits query', () => {
    render(<SmartSearchSection />);

    expect(screen.getByRole('heading', { name: /smart search/i })).toBeInTheDocument();
    expect(
      screen.getByText(/describe the kind of film you want to watch/i),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(/describe the kind of film you want/i),
      { target: { value: 'dreamy melancholic romance' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    expect(mockSearch).toHaveBeenCalledWith('dreamy melancholic romance');
  });

  test('shows validation error without rendering results', () => {
    mockUseSmartSearch.mockReturnValue(
      makeHookState({
        validationError: 'Please shorten your search. Try describing the film, mood, cinema, or time in one sentence.',
      }),
    );

    render(<SmartSearchSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please shorten your search');
    expect(screen.queryByText('Recommended films')).not.toBeInTheDocument();
  });

  test('shows loading state and disables submit', () => {
    mockUseSmartSearch.mockReturnValue(makeHookState({ loading: true }));

    render(<SmartSearchSection />);

    expect(screen.getByText(/finding screenings that might fit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /searching/i })).toBeDisabled();
  });

  test('shows degraded notice', () => {
    mockUseSmartSearch.mockReturnValue(makeHookState({ degraded: true }));

    render(<SmartSearchSection />);

    expect(
      screen.getByText(/smart search is temporarily limited/i),
    ).toBeInTheDocument();
  });

  test('renders film_results without debug score fields', async () => {
    mockUseSmartSearch.mockReturnValue(
      makeHookState({
        result: {
          mode: 'agentic',
          intent_type: 'discovery_query',
          result_type: 'film_results',
          items: [
            {
              film_id: 10,
              title: 'In the Mood for Love',
              year: 2000,
              genre: 'Romance, Drama',
              directors: 'Wong Kar-wai',
              match_score: 9,
              similarity: 0.82,
              lexical_rank: 0.41,
              retrieval_source: 'both',
              showtimes: [
                {
                  id: 101,
                  start_at_utc: '2026-06-07T03:00:00.000Z',
                  cinema_id: 1,
                  cinema_name: 'Cinematheque',
                  source_url: 'https://example.com/tickets',
                },
              ],
            },
          ],
        },
      }),
    );

    render(<SmartSearchSection />);

    await waitFor(() => {
      expect(screen.getByText('Recommended films')).toBeInTheDocument();
    });

    expect(screen.getByText(/in the mood for love/i)).toBeInTheDocument();
    expect(screen.queryByText(/match_score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.82/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lexical_rank/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/retrieval_source/i)).not.toBeInTheDocument();
  });

  test('renders empty_with_fallback message and hint', () => {
    mockUseSmartSearch.mockReturnValue(
      makeHookState({
        result: {
          mode: 'structured',
          intent_type: 'known_person_query',
          result_type: 'empty_with_fallback',
          items: [],
          message: 'No upcoming screenings found for Tarkovsky.',
          fallback_available: true,
          fallback_hint: 'Show films with a similar style?',
        },
      }),
    );

    render(<SmartSearchSection />);

    expect(screen.getByText(/no upcoming screenings found for tarkovsky/i)).toBeInTheDocument();
    expect(screen.getByText(/show films with a similar style/i)).toBeInTheDocument();
  });
});
