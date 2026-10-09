/**
 * Minimum-rating threshold options for the "Rating" filter — checked
 * against the real catalog before picking numbers (same reasoning as
 * `yearEras.js`). Of 177 currently upcoming films:
 *   IMDb >= 8.5: 1 (too thin, dropped)   IMDb >= 8: 13   >= 7.5: 36   >= 7: 46
 *   RT   >= 90: 16   >= 80: 31   >= 70: 34   >= 60: 34 (same as >=70, dropped)
 *
 * Each is a single minimum bar, not a multi-select facet value — the UI
 * presents these as a single-select per service (picking both "7+" and
 * "8+" doesn't mean anything additional "8+" doesn't already cover).
 * Ordered highest-first, the natural reading order for a minimum-rating list.
 */
export const IMDB_RATING_THRESHOLDS = [8, 7.5, 7];
export const RT_RATING_THRESHOLDS = [90, 80, 70];
