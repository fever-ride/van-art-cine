import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { apiMe, apiLogin, apiLogout } from '@/app/lib/auth';
import { apiListWatchlist } from '@/app/lib/watchlist';
import { GUEST_KEY } from '@/app/lib/guestWatchlist';

jest.mock('@/app/lib/auth', () => ({
  apiMe: jest.fn(),
  apiLogin: jest.fn(),
  apiLogout: jest.fn(),
  apiRegister: jest.fn(),
}));
jest.mock('@/app/lib/watchlist', () => ({ apiListWatchlist: jest.fn() }));

function Probe() {
  const { savedIds } = useWatchlist();
  const { status, signIn, signOut } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="ids">{[...savedIds].sort().join(',')}</span>
      <button onClick={() => signIn({ email: 'a@b.c', password: 'x' })}>in</button>
      <button onClick={() => signOut()}>out</button>
    </div>
  );
}

const ids = () => screen.getByTestId('ids').textContent;

describe('useWatchlist follows the shared auth state (no page refresh)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('guest → sign in → account list; sign out → guest list again', async () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify([1, 2]));
    apiMe.mockResolvedValueOnce(null); // first load: guest
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(ids()).toBe('1,2'));
    expect(screen.getByTestId('status')).toHaveTextContent('guest');

    // Sign in: login merges + clears the guest list (simulated), then /me says authed.
    apiLogin.mockImplementation(async () => {
      localStorage.setItem(GUEST_KEY, '[]');
      window.dispatchEvent(new StorageEvent('storage', { key: GUEST_KEY, newValue: '[]' }));
    });
    apiMe.mockResolvedValueOnce({ user: { uid: 7 } });
    apiListWatchlist.mockResolvedValue({ items: [{ screening_id: 1 }, { screening_id: 2 }, { screening_id: 9 }] });

    fireEvent.click(screen.getByText('in'));
    await waitFor(() => expect(ids()).toBe('1,2,9'));
    expect(screen.getByTestId('status')).toHaveTextContent('authed');

    // A guest-storage "cleared" event while signed in must not wipe the marks.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: GUEST_KEY, newValue: '[]' }));
    });
    expect(ids()).toBe('1,2,9');

    // Sign out (even if the request fails) → back to the (now empty) guest list.
    apiLogout.mockRejectedValue(new Error('401'));
    fireEvent.click(screen.getByText('out'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'));
    await waitFor(() => expect(ids()).toBe(''));
  });
});
