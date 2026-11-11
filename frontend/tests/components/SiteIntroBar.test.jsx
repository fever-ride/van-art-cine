import { render, screen, fireEvent } from '@testing-library/react';
import SiteIntroBar from '@/components/SiteIntroBar';
import { INTRO_DISMISSED_COOKIE } from '@/app/lib/siteIntro';

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

describe('SiteIntroBar', () => {
  afterEach(() => {
    document.cookie = `${INTRO_DISMISSED_COOKIE}=; Max-Age=0; Path=/`;
  });

  test('uses the homepage headline and links to the homepage', () => {
    render(<SiteIntroBar />);
    expect(screen.getByText("Vancouver's indie screenings, all in one place.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See what's on/ })).toHaveAttribute('href', '/');
  });

  test('dismiss hides it and remembers via cookie (read server-side next time)', () => {
    render(<SiteIntroBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/all in one place/)).toBeNull();
    expect(document.cookie).toContain(`${INTRO_DISMISSED_COOKIE}=1`);
  });

  test('cookie name is a plain string (server components must not import it from the client file)', () => {
    expect(INTRO_DISMISSED_COOKIE).toBe('intro_dismissed');
  });
});
