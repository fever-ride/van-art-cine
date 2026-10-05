'use client';

import Link from 'next/link';
import { Noto_Sans } from 'next/font/google';
import { NavigationMenu } from '@base-ui/react/navigation-menu';

// Same instantiation NavBar.tsx uses for its own header text (this
// project's convention: each component that needs it re-declares this
// rather than importing a shared font module). Needed again here
// specifically because NavigationMenu.Portal renders into document.body —
// outside NavBar's <header className={noto.className}> wrapper — so the
// popup does not inherit that font class the way DOM-nested content would
// and falls back to globals.css's plain `body { font-family: Arial, ... }`
// without this. Confirmed via getComputedStyle before and after this fix,
// not assumed.
const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '600', '700'] });

/** Add more `/whats-on/*` hub pages here as they ship. */
const ENTRIES = [{ href: '/whats-on/top-rated', label: 'Top Rated' }];

// Exactly NavBar.tsx's own `pill` style, including the lack of a
// rounded-* class — this trigger sits in the same pill row as "My
// Watchlist"/"About" and should look identical to them, not have its own
// rounded corners.
const pill =
  'whitespace-nowrap px-3 py-1.5 text-sm font-medium text-muted hover:bg-primary hover:text-white transition-colors';

/**
 * NavBar entry point into the hub pages under `/whats-on/` — labelled
 * "Must-Sees" rather than the route's own "what's on" wording, since that's
 * the more inviting, click-worthy framing for a reader.
 *
 * Built directly on `@base-ui/react/navigation-menu` (a Radix-like headless
 * primitives library — handles positioning, focus management, keyboard
 * navigation, and the WAI-ARIA navigation-menu pattern) rather than the
 * shadcn CLI's generated wrapper: this project styles it with its own
 * existing Tailwind tokens (`rounded-btn`, `border-border`, `bg-surface`,
 * etc.), the same ones every other component here uses, instead of
 * shadcn's own default visual language — styling is a separate decision
 * from fixing the interaction/accessibility gap, not bundled with it.
 *
 * This replaced a hand-rolled hover/click menu that worked but was missing
 * real keyboard navigation and focus management, and had reinvented — in a
 * simplified, less complete way — several things this primitive already
 * handles: portal-based positioning that doesn't get clipped by an
 * `overflow-x-auto` ancestor (NavBar's pill row), hover-intent timing so
 * moving the pointer from trigger to content doesn't close it early, and
 * keyboard support (Tab moves focus from the trigger into the panel's
 * links; Escape closes the panel and returns focus to the trigger —
 * verified live, not just assumed).
 *
 * `keepMounted` on `NavigationMenu.Content` keeps the links in the DOM
 * (hidden via the primitive's own `hidden` attribute) regardless of
 * open/closed state — this is what makes them crawlable in the initial
 * server rendered HTML, not just reachable after a click. Verified with
 * `curl` against a local dev server.
 */
export default function MustSeesMenu() {
  return (
    <NavigationMenu.Root className="relative snap-start">
      <NavigationMenu.List className="flex list-none items-center">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            className={`${pill} inline-flex items-center gap-1 outline-none focus-visible:ring-1 focus-visible:ring-accent/50`}
          >
            Must-Sees
            <ChevronIcon />
          </NavigationMenu.Trigger>

          <NavigationMenu.Content keepMounted className="p-1">
            {ENTRIES.map((entry) => (
              <NavigationMenu.Link
                key={entry.href}
                closeOnClick
                className="block px-4 py-2 text-sm text-primary outline-none hover:bg-surface-subtle focus-visible:bg-surface-subtle"
                render={<Link href={entry.href}>{entry.label}</Link>}
              />
            ))}
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          sideOffset={4}
          className={`${noto.className} z-50 outline-none`}
        >
          {/* Same popover treatment as ScreeningDateInput.tsx's date
           * picker — the other small anchored popover in this codebase —
           * rather than a differently-sourced shadow/radius combination. */}
          <NavigationMenu.Popup className="min-w-[180px] origin-(--transform-origin) rounded-card border border-border bg-surface shadow-[0_12px_28px_rgba(0,0,0,0.12)] outline-none">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
