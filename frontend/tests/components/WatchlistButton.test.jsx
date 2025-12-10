import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { apiToggleWatchlist } from '@/app/lib/watchlist';
import { getGuestSet, saveGuestSet } from '@/app/lib/guestWatchlist';

// Mock API module
jest.mock('@/app/lib/watchlist', () => ({
  apiToggleWatchlist: jest.fn(),
}));

// Mock guest watchlist helper module
jest.mock('@/app/lib/guestWatchlist', () => ({
  getGuestSet: jest.fn(),
  saveGuestSet: jest.fn(),
}));

describe('WatchlistButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders "Add to Watchlist" when initialSaved is false or undefined', () => {
    render(<WatchlistButton screeningId={123} />);

    const button = screen.getByRole('button', { name: /add to watchlist/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Add to Watchlist');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('renders "Added ✓" when initialSaved is true', () => {
    render(<WatchlistButton screeningId={123} initialSaved={true} />);

    const button = screen.getByRole('button', { name: /saved — remove/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Added ✓');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  test('calls apiToggleWatchlist and updates label on successful toggle', async () => {
    apiToggleWatchlist.mockResolvedValue({ saved: true });

    render(<WatchlistButton screeningId={42} initialSaved={false} />);

    const button = screen.getByRole('button', { name: /add to watchlist/i });

    // Click to toggle
    fireEvent.click(button);

    // During pending state we expect "Working…"
    expect(button).toHaveTextContent('Working…');

    // API called with screeningId
    await waitFor(() => {
      expect(apiToggleWatchlist).toHaveBeenCalledTimes(1);
      expect(apiToggleWatchlist).toHaveBeenCalledWith(42);
    });

    // After success we end up in saved state
    await waitFor(() => {
      const updated = screen.getByRole('button', { name: /saved — remove/i });
      expect(updated).toHaveTextContent('Added ✓');
      expect(updated).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test('rolls back to previous state when API throws a non-401 error', async () => {
    // Suppress console.error noise
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    apiToggleWatchlist.mockRejectedValue(new Error('Server failed'));

    render(<WatchlistButton screeningId={7} initialSaved={false} />);

    const button = screen.getByRole('button', { name: /add to watchlist/i });

    // Click to toggle (optimistic update)
    fireEvent.click(button);

    // Immediately after click we should see optimistic "Working…" text
    expect(button).toHaveTextContent('Working…');

    // After the rejected promise, we should roll back to "Add to Watchlist"
    await waitFor(() => {
      const reverted = screen.getByRole('button', {
        name: /add to watchlist/i,
      });
      expect(reverted).toHaveTextContent('Add to Watchlist');
      expect(reverted).toHaveAttribute('aria-pressed', 'false');
    });

    errorSpy.mockRestore();
  });

  test('uses guest watchlist when API returns 401 and adds the id to the set', async () => {
    // Simulate API 401 error
    apiToggleWatchlist.mockRejectedValue({ status: 401 });

    // Start with empty guest set
    const mockSet = new Set();
    getGuestSet.mockReturnValue(mockSet);

    render(<WatchlistButton screeningId={99} initialSaved={false} />);

    const button = screen.getByRole('button', { name: /add to watchlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      // Guest set should be saved once
      expect(saveGuestSet).toHaveBeenCalledTimes(1);
      const setArg = saveGuestSet.mock.calls[0][0];
      expect(setArg instanceof Set).toBe(true);
      expect(setArg.has(99)).toBe(true);
    });

    // Button should now be in "saved" state
    const updated = screen.getByRole('button', { name: /saved — remove/i });
    expect(updated).toHaveTextContent('Added ✓');
    expect(updated).toHaveAttribute('aria-pressed', 'true');
  });

  test('asks for confirmation before removing when confirmBeforeRemove is true', async () => {
    apiToggleWatchlist.mockResolvedValue({ saved: false });

    // Mock window.confirm
    const confirmSpy = jest
      .spyOn(window, 'confirm')
      .mockReturnValue(false); // user clicks "Cancel"

    render(
      <WatchlistButton
        screeningId={5}
        initialSaved={true}
        confirmBeforeRemove={true}
        confirmMessage="Are you sure?"
      />,
    );

    const button = screen.getByRole('button', { name: /saved — remove/i });

    // Click should trigger confirm dialog
    fireEvent.click(button);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('Are you sure?');

    // Because user cancelled, we should NOT call API
    expect(apiToggleWatchlist).not.toHaveBeenCalled();

    // State remains saved
    expect(button).toHaveTextContent('Added ✓');
    expect(button).toHaveAttribute('aria-pressed', 'true');

    confirmSpy.mockRestore();
  });

  test('calls onChange callback with final saved value on success', async () => {
    apiToggleWatchlist.mockResolvedValue({ saved: true });
    const onChange = jest.fn();

    render(
      <WatchlistButton
        screeningId={11}
        initialSaved={false}
        onChange={onChange}
      />,
    );

    const button = screen.getByRole('button', { name: /add to watchlist/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });
});