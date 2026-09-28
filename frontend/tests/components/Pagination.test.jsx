import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '@/components/screenings/Pagination';

function buildHref(page) {
  return page === 1 ? '/' : `/?page=${page}`;
}

describe('Pagination', () => {
  test('renders nothing when there is only one page', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders a real, crawlable href for every page link, not just an onClick handler', () => {
    render(
      <Pagination currentPage={1} totalPages={3} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );

    expect(screen.getByRole('link', { name: 'Go to page 2' })).toHaveAttribute('href', '/?page=2');
    expect(screen.getByRole('link', { name: 'Go to page 3' })).toHaveAttribute('href', '/?page=3');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/?page=2');
  });

  test('current page is marked aria-current and is not itself a link', () => {
    render(
      <Pagination currentPage={2} totalPages={3} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );

    const current = screen.getByText('2');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('A');
  });

  test('collapses a long run of pages into an ellipsis', () => {
    render(
      <Pagination currentPage={10} totalPages={20} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );

    // 1 … 8 9 10 11 12 … 20
    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Go to page 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to page 8' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to page 12' })).toBeInTheDocument();
  });

  test('Prev is absent on page 1, Next is absent on the last page', () => {
    const { rerender } = render(
      <Pagination currentPage={1} totalPages={3} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next page' })).toBeInTheDocument();

    rerender(
      <Pagination currentPage={3} totalPages={3} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous page' })).toBeInTheDocument();
  });

  test('a plain left click intercepts the link and calls onNavigate instead of a full page load', () => {
    const onNavigate = jest.fn();
    render(
      <Pagination currentPage={1} totalPages={3} buildPageHref={buildHref} onNavigate={onNavigate} />
    );

    const link = screen.getByRole('link', { name: 'Go to page 2' });
    const event = fireEvent.click(link, { button: 0 });

    expect(onNavigate).toHaveBeenCalledWith(2);
    // fireEvent.click returns false when preventDefault() was called.
    expect(event).toBe(false);
  });

  test('a modified click (e.g. cmd/ctrl for a new tab) is left alone: no preventDefault, no onNavigate', () => {
    const onNavigate = jest.fn();
    render(
      <Pagination currentPage={1} totalPages={3} buildPageHref={buildHref} onNavigate={onNavigate} />
    );

    const link = screen.getByRole('link', { name: 'Go to page 2' });
    const event = fireEvent.click(link, { button: 0, ctrlKey: true });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(event).toBe(true);
  });

  test('renders a "Page X of Y" fallback for narrow viewports, alongside (not instead of) the numbered links', () => {
    render(
      <Pagination currentPage={12} totalPages={27} buildPageHref={buildHref} onNavigate={jest.fn()} />
    );

    expect(screen.getByText('Page 12 of 27')).toBeInTheDocument();
    // Prev/Next still work regardless of viewport.
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/?page=11');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/?page=13');
  });

  test('while disabled, a plain click no longer intercepts (real link still present for crawlers)', () => {
    const onNavigate = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        buildPageHref={buildHref}
        onNavigate={onNavigate}
        disabled
      />
    );

    const link = screen.getByRole('link', { name: 'Go to page 2' });
    expect(link).toHaveAttribute('href', '/?page=2');

    fireEvent.click(link, { button: 0 });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
