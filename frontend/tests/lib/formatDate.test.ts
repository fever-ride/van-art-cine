import {
  formatScreeningTime,
  formatScreeningDateTime,
  todayYmdInDisplayTimezone,
  displayTimeZoneFor,
} from '@/app/lib/formatDate';

// BC moved to permanent UTC-7 on 2026-11-01. Output must not depend on the
// runtime's tzdata (Node 24 ships 2025b, which still says UTC-8).
describe('Vancouver display time', () => {
  test('VIFF regression: 20:30Z on 2026-11-08 is 1:30 PM in Vancouver', () => {
    expect(formatScreeningTime(new Date('2026-11-08T20:30:00Z'))).toBe('1:30 PM');
  });

  test('stays UTC-7 through the following winter', () => {
    expect(formatScreeningDateTime(new Date('2027-01-15T02:30:00Z'))).toBe('Thu, Jan 14, 7:30 PM');
  });

  test('older instants still use historical America/Vancouver rules', () => {
    expect(formatScreeningTime(new Date('2026-01-15T20:30:00Z'))).toBe('12:30 PM');
    expect(displayTimeZoneFor(new Date('2026-10-31T12:00:00Z'))).toBe('America/Vancouver');
  });

  test('"today" rolls over at Vancouver midnight (UTC-7)', () => {
    expect(todayYmdInDisplayTimezone(new Date('2026-11-09T06:59:00Z'))).toBe('2026-11-08');
    expect(todayYmdInDisplayTimezone(new Date('2026-11-09T07:00:00Z'))).toBe('2026-11-09');
  });
});
