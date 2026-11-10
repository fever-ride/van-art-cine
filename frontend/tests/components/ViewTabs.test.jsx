import { render, screen, fireEvent } from '@testing-library/react';
import ViewTabs from '@/components/screenings/ViewTabs';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

const pressed = () =>
  screen.getAllByRole('button').map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`);

describe('ViewTabs', () => {
  test('marks the current view with aria-pressed', () => {
    render(<ViewTabs view="table" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument();
    expect(pressed()).toEqual(['Movies:false', 'Showtimes:true']);
  });

  test('moves the selection immediately on click, before the URL commits', () => {
    const onChange = jest.fn();
    render(<ViewTabs view="table" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movies' }));
    expect(onChange).toHaveBeenCalledWith('film');
    expect(pressed()).toEqual(['Movies:true', 'Showtimes:false']);
  });

  test('clicking the current view does nothing', () => {
    const onChange = jest.fn();
    render(<ViewTabs view="table" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Showtimes' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('follows the URL when the view changes from outside (back/forward)', () => {
    const { rerender } = render(<ViewTabs view="table" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movies' }));
    rerender(<ViewTabs view="film" onChange={() => {}} />);
    rerender(<ViewTabs view="table" onChange={() => {}} />);
    expect(pressed()).toEqual(['Movies:false', 'Showtimes:true']);
  });
});
