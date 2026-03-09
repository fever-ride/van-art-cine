/** Error-like object with a string message (e.g. caught errors, API errors). */
export function isErrorLike(x: unknown): x is { message: string } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'message' in x &&
    typeof (x as Record<string, unknown>).message === 'string'
  );
}

/** True if value is empty, whitespace-only, or "n/a" / "na" (case-insensitive). */
export function isMissingText(value?: string | null): boolean {
  const t = value?.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return lower === 'n/a' || lower === 'na';
}

/** Object with a numeric `status` property (e.g. some error shapes). */
export function hasNumberStatus(x: unknown): x is { status: number } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'status' in x &&
    typeof (x as Record<string, unknown>).status === 'number'
  );
}

/** Object with `response: { status: number }` (e.g. axios-style errors). */
export function hasResponseStatus(x: unknown): x is { response: { status: number } } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'response' in x &&
    typeof (x as Record<string, unknown>).response === 'object' &&
    (x as { response: unknown }).response !== null &&
    'status' in (x as { response: Record<string, unknown> }).response! &&
    typeof (x as { response: { status: unknown } }).response.status === 'number'
  );
}

/** Non-empty string after trim. */
export function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim() !== '';
}
