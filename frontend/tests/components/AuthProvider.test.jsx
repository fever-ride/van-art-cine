import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';
import { apiMe, apiLogout } from '@/app/lib/auth';

jest.mock('@/app/lib/auth', () => ({
  apiMe: jest.fn(),
  apiLogin: jest.fn(),
  apiLogout: jest.fn(),
  apiRegister: jest.fn(),
}));

function Probe() {
  const { status, signOut } = useAuth();
  return (
    <>
      <span data-testid="status">{status}</span>
      <button onClick={() => signOut()}>out</button>
    </>
  );
}

const status = () => screen.getByTestId('status').textContent;

describe('AuthProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  test('starts loading, then reflects /me', async () => {
    apiMe.mockResolvedValue({ user: { uid: 1 } });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(status()).toBe('loading');
    await waitFor(() => expect(status()).toBe('authed'));
  });

  test('a slow /me that resolves after sign-out cannot flip back to authed', async () => {
    apiMe.mockResolvedValueOnce({ user: { uid: 1 } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(status()).toBe('authed'));

    // A re-check starts (e.g. tab became visible) and is slow…
    let resolveSlow;
    apiMe.mockReturnValueOnce(new Promise((r) => (resolveSlow = r)));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // …the user signs out meanwhile…
    apiLogout.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByText('out'));
    await waitFor(() => expect(status()).toBe('guest'));

    // …then the stale answer arrives. It must be ignored.
    await act(async () => {
      resolveSlow({ user: { uid: 1 } });
    });
    expect(status()).toBe('guest');
  });

  test('another tab signing in/out triggers a re-check', async () => {
    apiMe.mockResolvedValueOnce(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(status()).toBe('guest'));

    apiMe.mockResolvedValueOnce({ user: { uid: 2 } });
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'auth_changed', newValue: '1' }));
    });
    await waitFor(() => expect(status()).toBe('authed'));
  });

  test('useAuth outside the provider fails loudly', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/inside <AuthProvider>/);
    err.mockRestore();
  });
});
