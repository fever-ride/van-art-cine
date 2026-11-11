/** Cookie set when a visitor closes the site intro bar (SiteIntroBar). Lives
 * in a plain module, not the 'use client' component file: a Server Component
 * importing a non-component export from a client module gets a client
 * reference, not the string, so cookies().get() would never match. */
export const INTRO_DISMISSED_COOKIE = 'intro_dismissed';
