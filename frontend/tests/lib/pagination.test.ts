import { getPageWindow } from '@/lib/pagination';

describe('getPageWindow', () => {
  test('single page: just [1]', () => {
    expect(getPageWindow(1, 1)).toEqual([1]);
  });

  test('zero pages: empty', () => {
    expect(getPageWindow(1, 0)).toEqual([]);
  });

  test('small total (<= 7 with default sibling count): shows every page, no ellipsis', () => {
    expect(getPageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('current near the start: right ellipsis only', () => {
    expect(getPageWindow(1, 10)).toEqual([1, 2, 'ellipsis', 10]);
    expect(getPageWindow(2, 10)).toEqual([1, 2, 3, 'ellipsis', 10]);
  });

  test('current near the end: left ellipsis only', () => {
    expect(getPageWindow(10, 10)).toEqual([1, 'ellipsis', 9, 10]);
    expect(getPageWindow(9, 10)).toEqual([1, 'ellipsis', 8, 9, 10]);
  });

  test('current in the middle: both ellipses', () => {
    expect(getPageWindow(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  });

  test('never renders two ellipses back to back or an ellipsis standing in for one page', () => {
    // total=8, current=4: window would be 3..5, gap from 1 is just page 2 (no ellipsis needed there)
    expect(getPageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 8]);
  });

  test('respects a larger sibling count', () => {
    expect(getPageWindow(10, 20, 2)).toEqual([1, 'ellipsis', 8, 9, 10, 11, 12, 'ellipsis', 20]);
  });

  test('always starts with 1 and ends with total for any current within range', () => {
    for (let current = 1; current <= 50; current++) {
      const window = getPageWindow(current, 50);
      expect(window[0]).toBe(1);
      expect(window[window.length - 1]).toBe(50);
    }
  });
});
