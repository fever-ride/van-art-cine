import {
  cleanDisplayText,
  formatPeopleLine,
  parseImdbRating,
  splitAndClean,
} from '@/app/lib/displayText';
import { formatGenre } from '@/app/lib/formatGenre';
import { isMissingText } from '@/app/lib/typeGuards';

describe('isMissingText', () => {
  test.each(['N/A', 'n/a', 'NA', 'unknown', '—', '-', ''])(
    'treats "%s" as missing',
    (value) => {
      expect(isMissingText(value)).toBe(true);
    }
  );

  test('keeps real values', () => {
    expect(isMissingText('Christopher Nolan')).toBe(false);
    expect(isMissingText('Drama')).toBe(false);
  });
});

describe('displayText helpers', () => {
  test('formatPeopleLine filters placeholders', () => {
    expect(formatPeopleLine('N/A')).toBe('');
    expect(formatPeopleLine(['Jane Doe', 'N/A'])).toBe('Jane Doe');
    expect(formatPeopleLine('Jane Doe, unknown')).toBe('Jane Doe');
  });

  test('cleanDisplayText drops N/A descriptions', () => {
    expect(cleanDisplayText('N/A')).toBe('');
    expect(cleanDisplayText('  A real plot. ')).toBe('A real plot.');
  });

  test('parseImdbRating rejects N/A', () => {
    expect(parseImdbRating('N/A')).toBeNull();
    expect(parseImdbRating('8.1')).toBe(8.1);
  });

  test('formatGenre still filters N/A tokens', () => {
    expect(formatGenre('Drama, N/A, Thriller')).toEqual(['Drama', 'Thriller']);
  });

  test('splitAndClean handles comma lists', () => {
    expect(splitAndClean('English, N/A, French')).toEqual(['English', 'French']);
  });
});
