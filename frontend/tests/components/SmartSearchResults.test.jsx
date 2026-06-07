import { render, screen } from '@testing-library/react';
import SmartSearchResults from '@/components/smart-search/SmartSearchResults';

describe('SmartSearchResults', () => {
  test('renders screening_results using the screenings table', () => {
    render(
      <SmartSearchResults
        result={{
          mode: 'structured',
          intent_type: 'constraint_heavy_query',
          result_type: 'screening_results',
          items: [
            {
              id: 55,
              title: 'Short Film',
              film_id: 9,
              cinema_id: 2,
              cinema_name: 'Rio Theatre',
              start_at_utc: '2026-06-07T03:00:00.000Z',
              runtime_min: 80,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Matching screenings')).toBeInTheDocument();
    expect(screen.getByText('Short Film')).toBeInTheDocument();
    expect(screen.getByText('Rio Theatre')).toBeInTheDocument();
  });

  test('renders out-of-scope empty state with fixed message', () => {
    render(
      <SmartSearchResults
        result={{
          mode: 'unsupported',
          intent_type: 'out_of_scope',
          result_type: 'empty_with_fallback',
          items: [],
          message: 'Smart Search can help you find Vancouver indie film screenings. Try asking for a film, cinema, showtime, or movie mood.',
        }}
      />,
    );

    expect(
      screen.getByText(/smart search can help you find vancouver indie film screenings/i),
    ).toBeInTheDocument();
  });
});
