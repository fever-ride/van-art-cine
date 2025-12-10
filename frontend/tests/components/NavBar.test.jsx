import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NavBar from '@/components/NavBar';
import { apiMe, apiLogout } from '@/app/lib/auth';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
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
}));

describe('NavBar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays login and register when user is not authenticated', async () => {
    apiMe.mockResolvedValue({ user: null });

    render(<NavBar />);

    await waitFor(() => {
      expect(apiMe).toHaveBeenCalled();
    });

    expect(screen.getByText('Log in')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();
  });

  test('displays logout and My Profile when user is authenticated', async () => {
    apiMe.mockResolvedValue({ user: { id: 1, name: 'Test User' } });

    render(<NavBar />);

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    expect(screen.getByText('My Profile')).toBeInTheDocument();
    expect(screen.queryByText('Log in')).not.toBeInTheDocument();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
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

  test('calls apiLogout and returns to logged-out state when logout is clicked', async () => {
    apiMe.mockResolvedValue({ user: { id: 1 } });
    apiLogout.mockResolvedValue({ ok: true });

    render(<NavBar />);

    const logoutButton = await screen.findByText('Logout');

    // fireEvent instead of userEvent
    fireEvent.click(logoutButton);

    expect(apiLogout).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText('Log in')).toBeInTheDocument();
      expect(screen.getByText('Register')).toBeInTheDocument();
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
    expect(aboutLink).toHaveClass('bg-highlight');
  });
});