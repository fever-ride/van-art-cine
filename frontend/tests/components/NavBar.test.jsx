import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NavBar from '@/components/NavBar';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { apiMe, apiLogout } from '@/app/lib/auth';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  })),
}));

// Mock Next.js Link
jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

// Mock Next.js Image
jest.mock('next/image', () => {
  return function MockImage(props) {
    return <img {...props} alt={props.alt || ''} />;
  };
});

// Mock auth API
jest.mock('@/app/lib/auth', () => ({
  apiMe: jest.fn(),
  apiLogout: jest.fn(),
  apiLogin: jest.fn(),
  apiRegister: jest.fn(),
}));

// NavBar reads auth from the app-wide provider (as in app/layout.tsx).
const renderNav = () =>
  render(
    <AuthProvider>
      <NavBar />
    </AuthProvider>,
  );

describe('NavBar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays login and register when user is not authenticated', async () => {
    apiMe.mockResolvedValue({ user: null });

    renderNav();

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Create account')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });

  test('displays logout and My Profile when user is authenticated', async () => {
    apiMe.mockResolvedValue({ user: { id: 1, name: 'Test User' } });

    renderNav();

    await waitFor(() => {
      expect(screen.getByText('Sign out')).toBeInTheDocument();
    });

    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
  });

  test('shows common navigation links for all users', async () => {
    apiMe.mockResolvedValue({ user: null });

    renderNav();

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    expect(screen.getByText('My Watchlist')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  test('calls apiLogout and returns to logged-out state when logout is clicked', async () => {
    apiMe.mockResolvedValue({ user: { id: 1 } });
    apiLogout.mockResolvedValue({ ok: true });

    renderNav();

    const logoutButton = await screen.findByText('Sign out');

    // fireEvent instead of userEvent
    fireEvent.click(logoutButton);

    expect(apiLogout).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText('Sign in')).toBeInTheDocument();
      expect(screen.getByText('Create account')).toBeInTheDocument();
    });
  });

  test('applies active styles to current page link', async () => {
    const { usePathname } = require('next/navigation');
    usePathname.mockReturnValue('/about');

    apiMe.mockResolvedValue({ user: null });

    renderNav();

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    const aboutLink = screen.getByText('About').closest('a');
    expect(aboutLink).toHaveClass('bg-primary');
  });

  test('sign out still signs out locally when the request fails (expired session)', async () => {
    // Regression: logout used to require a valid 15-min access token; when it
    // 401'd, handleLogout threw before updating state and the button did nothing.
    apiMe.mockResolvedValue({ user: { uid: 1 } });
    apiLogout.mockRejectedValue(new Error('Logout failed: 401'));

    renderNav();
    fireEvent.click(await screen.findByText('Sign out'));

    await waitFor(() => {
      expect(screen.getByText('Sign in')).toBeInTheDocument();
    });
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });
});
