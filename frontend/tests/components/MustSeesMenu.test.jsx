import { render, screen, fireEvent } from '@testing-library/react';
import MustSeesMenu from '@/components/MustSeesMenu';

describe('MustSeesMenu', () => {
  test('the Top Rated link is a real href, present in the DOM even before the panel is opened', () => {
    render(<MustSeesMenu />);
    // hidden: true — NavigationMenuContent's `keepMounted` keeps this link
    // in the DOM at all times (hidden via the `hidden` attribute when
    // closed), which is what makes it crawlable in the initial server
    // rendered HTML rather than only reachable after a click — verified
    // separately with `curl` against a real dev server. RTL's default role
    // query excludes hidden elements, same as a screen reader would, so
    // this needs to opt back in explicitly to find it.
    expect(
      screen.getByRole('link', { name: 'Top Rated', hidden: true })
    ).toHaveAttribute('href', '/whats-on/top-rated');
  });

  test('clicking the trigger opens the panel', () => {
    render(<MustSeesMenu />);
    const trigger = screen.getByRole('button', { name: /Must-Sees/ });

    fireEvent.click(trigger);

    expect(
      screen.getByRole('link', { name: 'Top Rated' })
    ).toBeInTheDocument();
  });

  test('clicking the Top Rated link closes the panel (does not stay open after navigating)', () => {
    render(<MustSeesMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Must-Sees/ }));

    fireEvent.click(screen.getByRole('link', { name: 'Top Rated' }));

    expect(
      screen.queryByRole('link', { name: 'Top Rated' })
    ).not.toBeInTheDocument();
  });
});
