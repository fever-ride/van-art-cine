import {
  defaultUI,
  parseUIStateFromSearchParams,
  serializeUIStateToSearchParams,
  buildScreeningsQuery,
  isInvalidDateRange,
  type UIState,
} from '@/lib/hooks/screeningsUrlState';

describe('parseUIStateFromSearchParams', () => {
  test('an empty URL parses to defaultUI', () => {
    const params = new URLSearchParams('');
    expect(parseUIStateFromSearchParams(params)).toEqual(defaultUI);
  });

  test('parses cinema_ids, trimming whitespace and dropping empty entries', () => {
    const params = new URLSearchParams('cinema_ids=3, 7,,12');
    const result = parseUIStateFromSearchParams(params);
    expect(result.cinemaIds).toEqual(['3', '7', '12']);
  });

  test('a date param implies single mode and leaves from/to empty', () => {
    const params = new URLSearchParams('date=2026-08-05');
    const result = parseUIStateFromSearchParams(params);
    expect(result.mode).toBe('single');
    expect(result.date).toBe('2026-08-05');
    expect(result.from).toBe('');
    expect(result.to).toBe('');
  });

  test('from/to params imply range mode and leave date empty', () => {
    const params = new URLSearchParams('from=2026-08-05&to=2026-08-10');
    const result = parseUIStateFromSearchParams(params);
    expect(result.mode).toBe('range');
    expect(result.from).toBe('2026-08-05');
    expect(result.to).toBe('2026-08-10');
    expect(result.date).toBe('');
  });

  test('a partial range (only "from") still implies range mode', () => {
    const params = new URLSearchParams('from=2026-08-05');
    const result = parseUIStateFromSearchParams(params);
    expect(result.mode).toBe('range');
  });

  test('date and from/to both present prefers single mode', () => {
    const params = new URLSearchParams('date=2026-08-05&from=2026-08-01&to=2026-08-10');
    const result = parseUIStateFromSearchParams(params);
    expect(result.mode).toBe('single');
    expect(result.date).toBe('2026-08-05');
    expect(result.from).toBe('');
    expect(result.to).toBe('');
  });

  test('an unrecognized sort value falls back to the default instead of throwing', () => {
    const params = new URLSearchParams('sort=not-a-real-sort');
    const result = parseUIStateFromSearchParams(params);
    expect(result.sort).toBe(defaultUI.sort);
  });

  test('an unrecognized order value falls back to the default instead of throwing', () => {
    const params = new URLSearchParams('order=sideways');
    const result = parseUIStateFromSearchParams(params);
    expect(result.order).toBe(defaultUI.order);
  });

  test('a recognized sort and order value is used as is', () => {
    const params = new URLSearchParams('sort=title&order=desc');
    const result = parseUIStateFromSearchParams(params);
    expect(result.sort).toBe('title');
    expect(result.order).toBe('desc');
  });

  test('q and film_id are read directly', () => {
    const params = new URLSearchParams('q=Ozu&film_id=42');
    const result = parseUIStateFromSearchParams(params);
    expect(result.q).toBe('Ozu');
    expect(result.filmId).toBe('42');
  });

  test('limit is always the default, since it is not part of the URL scheme', () => {
    const params = new URLSearchParams('limit=100');
    const result = parseUIStateFromSearchParams(params);
    expect(result.limit).toBe(defaultUI.limit);
  });

  test('overrides replace defaultUI for fields the URL does not specify', () => {
    const params = new URLSearchParams('');
    const result = parseUIStateFromSearchParams(params, { mode: 'range', sort: 'title' });
    expect(result.mode).toBe('range');
    expect(result.sort).toBe('title');
    // Fields with no override still fall back to defaultUI.
    expect(result.order).toBe(defaultUI.order);
  });

  test('a value present in the URL wins over an override for that field', () => {
    const params = new URLSearchParams('sort=imdb');
    const result = parseUIStateFromSearchParams(params, { sort: 'title' });
    expect(result.sort).toBe('imdb');
  });
});

describe('serializeUIStateToSearchParams', () => {
  test('defaultUI serializes to an empty query string', () => {
    const params = serializeUIStateToSearchParams(defaultUI);
    expect(params.toString()).toBe('');
  });

  test('a non-default search query is included', () => {
    const params = serializeUIStateToSearchParams({ ...defaultUI, q: 'Ozu' });
    expect(params.get('q')).toBe('Ozu');
  });

  test('cinemaIds are joined with commas', () => {
    const params = serializeUIStateToSearchParams({
      ...defaultUI,
      cinemaIds: ['3', '7', '12'],
    });
    expect(params.get('cinema_ids')).toBe('3,7,12');
  });

  test('single mode with a date only sets date, not from/to', () => {
    const params = serializeUIStateToSearchParams({
      ...defaultUI,
      mode: 'single',
      date: '2026-08-05',
    });
    expect(params.get('date')).toBe('2026-08-05');
    expect(params.has('from')).toBe(false);
    expect(params.has('to')).toBe(false);
  });

  test('range mode with from/to only sets from/to, not date', () => {
    const params = serializeUIStateToSearchParams({
      ...defaultUI,
      mode: 'range',
      from: '2026-08-05',
      to: '2026-08-10',
    });
    expect(params.get('from')).toBe('2026-08-05');
    expect(params.get('to')).toBe('2026-08-10');
    expect(params.has('date')).toBe(false);
  });

  test('default sort and order are omitted, non-default values are included', () => {
    const defaultParams = serializeUIStateToSearchParams(defaultUI);
    expect(defaultParams.has('sort')).toBe(false);
    expect(defaultParams.has('order')).toBe(false);

    const changedParams = serializeUIStateToSearchParams({
      ...defaultUI,
      sort: 'title',
      order: 'desc',
    });
    expect(changedParams.get('sort')).toBe('title');
    expect(changedParams.get('order')).toBe('desc');
  });

  test('limit is never serialized, since it is not part of the URL scheme', () => {
    const params = serializeUIStateToSearchParams({ ...defaultUI, limit: 100 });
    expect(params.has('limit')).toBe(false);
  });
});

describe('round trip', () => {
  test('parsing a serialized non-default UIState reproduces it', () => {
    const original: UIState = {
      mode: 'range',
      date: '',
      from: '2026-08-05',
      to: '2026-08-10',
      q: 'Ozu',
      cinemaIds: ['3', '7'],
      filmId: '',
      sort: 'title',
      order: 'desc',
      limit: defaultUI.limit,
    };

    const params = serializeUIStateToSearchParams(original);
    const roundTripped = parseUIStateFromSearchParams(params);

    expect(roundTripped).toEqual(original);
  });

  test('parsing a serialized defaultUI reproduces defaultUI', () => {
    const params = serializeUIStateToSearchParams(defaultUI);
    const roundTripped = parseUIStateFromSearchParams(params);
    expect(roundTripped).toEqual(defaultUI);
  });
});

describe('isInvalidDateRange', () => {
  test('false for single date mode regardless of the date value', () => {
    expect(isInvalidDateRange({ ...defaultUI, mode: 'single', date: '2026-08-05' })).toBe(false);
  });

  test('false for a range with from before to', () => {
    expect(
      isInvalidDateRange({ ...defaultUI, mode: 'range', from: '2026-08-01', to: '2026-08-05' })
    ).toBe(false);
  });

  test('false for a range missing one side', () => {
    expect(isInvalidDateRange({ ...defaultUI, mode: 'range', from: '2026-08-01', to: '' })).toBe(
      false
    );
  });

  test('true for a range with from after to', () => {
    expect(
      isInvalidDateRange({ ...defaultUI, mode: 'range', from: '2026-08-10', to: '2026-08-01' })
    ).toBe(true);
  });
});

describe('buildScreeningsQuery', () => {
  test('defaults to America/Vancouver and the given offset', () => {
    const query = buildScreeningsQuery(defaultUI, 40);
    expect(query.tz).toBe('America/Vancouver');
    expect(query.offset).toBe(40);
    expect(query.limit).toBe(defaultUI.limit);
  });

  test('single mode sends date, not from/to', () => {
    const query = buildScreeningsQuery({ ...defaultUI, mode: 'single', date: '2026-08-05' });
    expect(query.date).toBe('2026-08-05');
    expect(query.from).toBeUndefined();
    expect(query.to).toBeUndefined();
  });

  test('range mode sends from/to, not date', () => {
    const query = buildScreeningsQuery({
      ...defaultUI,
      mode: 'range',
      from: '2026-08-01',
      to: '2026-08-05',
    });
    expect(query.from).toBe('2026-08-01');
    expect(query.to).toBe('2026-08-05');
    expect(query.date).toBeUndefined();
  });

  test('cinemaIds are converted to numbers, empty array becomes undefined', () => {
    expect(buildScreeningsQuery({ ...defaultUI, cinemaIds: ['3', '7'] }).cinema_ids).toEqual([
      3, 7,
    ]);
    expect(buildScreeningsQuery({ ...defaultUI, cinemaIds: [] }).cinema_ids).toBeUndefined();
  });

  test('an empty filmId becomes undefined, not NaN or an empty string', () => {
    expect(buildScreeningsQuery({ ...defaultUI, filmId: '' }).film_id).toBeUndefined();
    expect(buildScreeningsQuery({ ...defaultUI, filmId: '42' }).film_id).toBe(42);
  });
});
