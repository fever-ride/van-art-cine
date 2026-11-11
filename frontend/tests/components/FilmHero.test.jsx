import { render, screen } from '@testing-library/react';
import FilmHero from '@/components/films/FilmHero';

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

const film = {
  title: 'The Best Years of Our Lives',
  year: 1946,
  country: 'United States',
  genre: 'Drama, Romance',
  rated: 'PG',
  imdb_rating: '8.1',
  imdb_votes: 77300,
  rt_rating_pct: 97,
  imdb_url: 'https://www.imdb.com/title/tt0036868/',
  directors: ['William Wyler'],
  poster_url: 'https://image.tmdb.org/t/p/w342/x.jpg',
};

const next = {
  id: 5,
  title: 'The Best Years of Our Lives',
  start_at_utc: '2025-01-01T22:30:00Z',
  runtime_min: 170,
  cinema_id: 1,
  cinema_name: 'VIFF Cinema',
  source_url: 'https://example.com/tix',
};

describe('FilmHero keeps every fact the old header showed', () => {
  test('title, facts, genres, rating, scores, IMDb link, poster', () => {
    render(<FilmHero film={film} nextScreening={next} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(film.title);
    expect(screen.getByText('1946 · United States · 170 min · Dir. William Wyler')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByText('Romance')).toBeInTheDocument();
    expect(screen.getByText('8.1')).toBeInTheDocument();
    expect(screen.getByText('(77,300)')).toBeInTheDocument();
    expect(screen.getByText('97%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /IMDb profile/ })).toHaveAttribute('href', film.imdb_url);
    expect(screen.getByAltText(`${film.title} poster`)).toHaveAttribute('src', film.poster_url);
  });

  test('next screening card with Get tickets', () => {
    render(<FilmHero film={film} nextScreening={next} />);
    expect(screen.getByText('Next screening')).toBeInTheDocument();
    expect(screen.getByText('VIFF Cinema')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get tickets' })).toHaveAttribute('href', next.source_url);
  });

  test('no upcoming screening → message instead of the card; fallback poster', () => {
    render(<FilmHero film={{ ...film, poster_url: null }} />);
    expect(screen.getByText(/No upcoming screenings/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get tickets' })).toBeNull();
    expect(screen.getByAltText(`${film.title} poster`).getAttribute('src')).toMatch(/unsplash/);
  });

  test('site intro eyebrow only when showIntro (external visitor)', () => {
    const { rerender } = render(<FilmHero film={film} nextScreening={next} />);
    expect(screen.queryByText(/all in one place/)).toBeNull();
    rerender(<FilmHero film={film} nextScreening={next} showIntro />);
    expect(screen.getByText(/all in one place/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See what's on/ })).toHaveAttribute('href', '/');
  });
});
