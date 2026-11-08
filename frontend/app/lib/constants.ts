/**
 * Shared constants used across the frontend.
 * Import individual exports rather than the whole module to keep bundles lean.
 */

/**
 * The venues' IANA zone. Do NOT pass this straight to Intl for display —
 * use `displayTimeZoneFor()` in ./formatDate, which pins Vancouver's
 * post-2026 rule instead of trusting the runtime's tzdata.
 * See TROUBLESHOOTING.md → "Showtimes off by one hour".
 */
export const DISPLAY_TIMEZONE = 'America/Vancouver';

/**
 * From this instant (2026-11-01 02:00 PDT) British Columbia stays on UTC-7
 * all year ("permanent Pacific Time"). Runtimes with tzdata older than
 * 2026c still think Vancouver falls back to UTC-8, so we pin it ourselves.
 */
export const VANCOUVER_PERMANENT_UTC7_FROM = Date.UTC(2026, 10, 1, 9, 0, 0);

/** Fixed UTC-7 zone. POSIX-style names invert the sign: Etc/GMT+7 = UTC-7. */
export const FIXED_UTC_MINUS_7 = 'Etc/GMT+7';
