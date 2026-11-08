import { describe, test, expect } from '@jest/globals';
import { localDayToUtcRange, localRangeToUtc } from '../../src/utils/time.js';

const iso = (d) => d.toISOString();

// BC moved to permanent UTC-7 on 2026-11-01. These must hold regardless of
// the tzdata bundled with the Node running the tests.
describe('Vancouver day -> UTC range', () => {
  test('after the 2026 change, winter days are UTC-7 (no fall-back to UTC-8)', () => {
    const [s, e] = localDayToUtcRange('2026-11-08', 'America/Vancouver');
    expect(iso(s)).toBe('2026-11-08T07:00:00.000Z');
    expect(iso(e)).toBe('2026-11-09T07:00:00.000Z');
    expect(iso(localDayToUtcRange('2027-01-15', 'America/Vancouver')[0])).toBe('2027-01-15T07:00:00.000Z');
  });

  test('the change day itself is a normal 24h day at UTC-7', () => {
    const [s, e] = localDayToUtcRange('2026-11-01', 'America/Vancouver');
    expect(iso(s)).toBe('2026-11-01T07:00:00.000Z');
    expect(iso(e)).toBe('2026-11-02T07:00:00.000Z');
  });

  test('historical winter dates keep the old UTC-8 offset', () => {
    expect(iso(localDayToUtcRange('2026-01-15', 'America/Vancouver')[0])).toBe('2026-01-15T08:00:00.000Z');
  });

  test('ranges and month/year rollover', () => {
    const [s, e] = localRangeToUtc('2026-12-30', '2026-12-31', 'America/Vancouver');
    expect(iso(s)).toBe('2026-12-30T07:00:00.000Z');
    expect(iso(e)).toBe('2027-01-01T07:00:00.000Z');
    expect(localRangeToUtc(null, null, 'America/Vancouver')).toEqual([null, null]);
  });

  test('other zones still go through date-fns-tz', () => {
    expect(iso(localDayToUtcRange('2026-11-08', 'UTC')[0])).toBe('2026-11-08T00:00:00.000Z');
  });
});
