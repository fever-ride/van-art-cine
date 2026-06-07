/**
 * Smart Search API client and response types.
 *
 * Calls `GET /api/smart-search` and returns intent-aware results shaped by
 * `result_type`. Internal ranking/debug fields are kept on the payload for
 * eval tooling but should not be shown in normal UI.
 */

export const SMART_SEARCH_MAX_QUERY_LENGTH = 500;

export const SMART_SEARCH_OUT_OF_SCOPE_MESSAGE =
  'Smart Search can help you find Vancouver indie film screenings. Try asking for a film, cinema, showtime, or movie mood.';

export const SMART_SEARCH_DEGRADED_NOTICE =
  'Smart Search is temporarily limited. Showing simpler title matches.';

export const SMART_SEARCH_UNAVAILABLE_MESSAGE =
  'Smart Search is temporarily unavailable. Please try again later.';

export const SMART_SEARCH_QUERY_TOO_LONG_MESSAGE =
  'Please shorten your search. Try describing the film, mood, cinema, or time in one sentence.';

export type SmartSearchResultType =
  | 'film_results'
  | 'screening_results'
  | 'film_showtimes'
  | 'cinema_schedule'
  | 'person_results'
  | 'empty_with_fallback';

export type SmartSearchMode =
  | 'structured'
  | 'agentic'
  | 'degraded'
  | 'unsupported';

export interface SmartSearchShowtime {
  id: number;
  start_at_utc: string;
  end_at_utc?: string | null;
  runtime_min?: number | null;
  tz?: string | null;
  cinema_id: number;
  cinema_name: string;
  source_url?: string | null;
}

export interface SmartSearchFilmResult {
  film_id: number;
  title: string;
  year?: number | null;
  genre?: string | null;
  language?: string | null;
  country?: string | null;
  description?: string | null;
  rated?: string | null;
  awards?: string | null;
  imdb_rating?: number | null;
  rt_rating_pct?: number | null;
  imdb_votes?: number | null;
  imdb_url?: string | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  directors?: string | null;
  match_score?: number | null;
  match_explanation?: string | null;
  similarity?: number | null;
  lexical_rank?: number | null;
  retrieval_source?: string | null;
  showtimes: SmartSearchShowtime[];
}

export interface SmartSearchScreeningResult {
  id: number;
  title: string;
  start_at_utc: string;
  end_at_utc?: string | null;
  runtime_min?: number | null;
  tz?: string | null;
  cinema_id: number;
  cinema_name: string;
  film_id: number;
  year?: number | null;
  genre?: string | null;
  directors?: string | null;
  description?: string | null;
  rated?: string | null;
  language?: string | null;
  country?: string | null;
  awards?: string | null;
  imdb_rating?: number | null;
  rt_rating_pct?: number | null;
  imdb_votes?: number | null;
  imdb_url?: string | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  source_url?: string | null;
  match_score?: number | null;
  match_explanation?: string | null;
  similarity?: number | null;
  lexical_rank?: number | null;
  retrieval_source?: string | null;
}

export interface SmartSearchResponse {
  mode: SmartSearchMode;
  intent_type: string | null;
  result_type: SmartSearchResultType;
  items: SmartSearchFilmResult[] | SmartSearchScreeningResult[];
  message?: string;
  fallback_available?: boolean;
  fallback_hint?: string | null;
}

export interface SmartSearchQuery {
  q: string;
  limit?: number;
}

export interface SmartSearchApiResult {
  data: SmartSearchResponse;
  degraded: boolean;
}

export function validateSmartSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return 'Enter a search to describe the kind of film you want.';
  if (trimmed.length > SMART_SEARCH_MAX_QUERY_LENGTH) {
    return SMART_SEARCH_QUERY_TOO_LONG_MESSAGE;
  }
  return null;
}

export async function apiSmartSearch(
  params: SmartSearchQuery,
): Promise<SmartSearchApiResult> {
  const sp = new URLSearchParams();
  sp.set('q', params.q.trim());
  if (params.limit != null) sp.set('limit', String(params.limit));

  const res = await fetch(`/api/smart-search?${sp.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 400) {
      throw new Error('Please check your search and try again.');
    }
    if (res.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }
    throw new Error(SMART_SEARCH_UNAVAILABLE_MESSAGE);
  }

  const data = (await res.json()) as SmartSearchResponse;
  const degraded = res.headers.get('x-search-degraded') === 'true';

  return { data, degraded };
}
