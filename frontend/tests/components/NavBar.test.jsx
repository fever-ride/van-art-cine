import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NavBar from '@/components/NavBar';
import { apiMe, apiLogout } from '@/app/lib/auth';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
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

// Mock next/font/google
jest.mock('next/font/google', () => ({
  Noto_Sans: () => ({ className: 'mock-noto' }),
}));

// Mock auth API
jest.mock('@/app/lib/auth', () => ({
  apiMe: jest.fn(),
  apiLogout: jest.fn(),
}));

describe('NavBar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays Sign in and Create account when user is not authenticated', async () => {
    apiMe.mockResolvedValue({ user: null });

    render(<NavBar />);

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Create account')).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
  });

  test('displays Sign out when user is authenticated', async () => {
    apiMe.mockResolvedValue({ user: { id: 1, name: 'Test User' } });

    render(<NavBar />);

    await waitFor(() => {
      expect(screen.getByText('Sign out')).toBeInTheDocument();
    });

    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
  });

  test('shows common navigation links for all users', async () => {
    apiMe.mockResolvedValue({ user: null });

    render(<NavBar />);

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    expect(screen.getByText('My Watchlist')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  test('calls apiLogout and returns to signed-out state when Sign out is clicked', async () => {
    apiMe.mockResolvedValue({ user: { id: 1 } });
    apiLogout.mockResolvedValue({ ok: true });

    render(<NavBar />);

    const signOutButton = await screen.findByText('Sign out');
    fireEvent.click(signOutButton);

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

    render(<NavBar />);

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    const aboutLink = screen.getByText('About').closest('a');
    expect(aboutLink).toHaveClass('bg-primary');
    expect(aboutLink).toHaveClass('text-white');
  });
});
