import { render, screen, fireEvent } from '@testing-library/react';
import Filters from '@/components/screenings/Filters';

jest.mock('@/app/lib/formatDate', () => ({
  todayYmdInDisplayTimezone: () => '2026-06-06',
}));

// Build a minimal UIState-like object
function makeUI(overrides = {}) {
  return {
    q: '',
    cinemaIds: [],
    genreValues: [],
    languageValues: [],
    eraValues: [],
    minImdb: '',
    minRt: '',
    filmId: '',
    date: '',
    from: '',
    to: '',
    sort: 'time',
    order: 'asc',
    mode: 'single',
    limit: 50,
    view: 'table',
    ...overrides,
  };
}

describe('Filters component', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders basic controls (cinemas, sort, order, mode, buttons) and no search box', () => {
    const ui = makeUI();
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
      />
    );

    // Search moved out to the shared SearchBar
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();

    // Cinemas label
    expect(screen.getByText('Cinemas')).toBeInTheDocument();

    // Sort / Order labels
    expect(screen.getByText('Sort')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();

    // Mode radios
    expect(screen.getByLabelText('Single date')).toBeInTheDocument();
    expect(screen.getByLabelText('Date range')).toBeInTheDocument();

    // Action buttons
    expect(
      screen.getByRole('button', { name: 'Reset' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply' })
    ).toBeInTheDocument();
  });

  test('selecting and clearing cinemas updates the summary text', () => {
    const ui = makeUI();
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    const cinemaOptions = [
      { id: 1, name: 'Cinema One' },
      { id: 2, name: 'Cinema Two' },
    ];

    render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={cinemaOptions}
      />
    );

    // Initially shows "all cinemas"
    expect(
      screen.getByText('Showing all cinemas')
    ).toBeInTheDocument();

    // Click first cinema checkbox
    const cinemaOneCheckbox = screen.getByLabelText('Cinema One');
    fireEvent.click(cinemaOneCheckbox);

    expect(
      screen.getByText('1 cinema selected')
    ).toBeInTheDocument();

    // Clear button should show and reset local cinemaIds
    const clearButton = screen.getByRole('button', {
      name: /Clear \(1\)/,
    });

    fireEvent.click(clearButton);

    expect(
      screen.getByText('Showing all cinemas')
    ).toBeInTheDocument();
  });

  test('Apply sends only the sidebar filters (never q) via setFilters and calls onBeforeCommit', () => {
    const ui = makeUI({ q: 'hello' });
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
      />
    );

    const sortSelect = screen.getByLabelText('Sort');
    const orderSelect = screen.getByLabelText('Order');

    // Change sort and order in localUI
    fireEvent.change(sortSelect, { target: { value: 'title' } });
    fireEvent.change(orderSelect, { target: { value: 'desc' } });

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyButton);

    expect(setFilters).toHaveBeenCalledTimes(1);
    const { q, ...sidebarFields } = ui;
    expect(setFilters).toHaveBeenCalledWith({
      ...sidebarFields,
      sort: 'title',
      order: 'desc',
    });
    expect(setFilters.mock.calls[0][0]).not.toHaveProperty('q');
    expect(onBeforeCommit).toHaveBeenCalledTimes(1);
  });

  test('Reset button resets filters to default values and calls setFilters + onBeforeCommit', () => {
    const ui = makeUI({
      q: 'something',
      cinemaIds: ['1', '2'],
      filmId: '123',
      date: '2025-01-01',
      from: '2025-01-01',
      to: '2025-01-10',
      sort: 'title',
      order: 'desc',
      mode: 'range',
      limit: 99,
    });

    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
      />
    );

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(resetButton);

    expect(setFilters).toHaveBeenCalledTimes(1);
    // Reset clears the sidebar only; the search term is left alone.
    expect(setFilters.mock.calls[0][0]).not.toHaveProperty('q');
    expect(setFilters).toHaveBeenCalledWith({
      cinemaIds: [],
      genreValues: [],
      languageValues: [],
      eraValues: [],
      minImdb: '',
      minRt: '',
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
    });
    expect(onBeforeCommit).toHaveBeenCalledTimes(1);

    // Summary text also reflects cleared cinemas
    expect(
      screen.getByText('Showing all cinemas')
    ).toBeInTheDocument();
  });

  test('renders custom date pickers instead of native date inputs', () => {
    const ui = makeUI({ mode: 'range', from: '2026-06-10', to: '2026-06-12' });
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    const { container } = render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
      />
    );

    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(screen.getByText('Jun 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jun 12, 2026')).toBeInTheDocument();
  });

  test('switching between Single date and Date range toggles date inputs', () => {
    const ui = makeUI({ mode: 'single' });
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    const { container } = render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
      />
    );

    const singleRadio = screen.getByLabelText('Single date');
    const rangeRadio = screen.getByLabelText('Date range');

    expect(singleRadio).toBeChecked();
    expect(
      container.querySelectorAll('button[aria-haspopup="dialog"]').length
    ).toBe(1);

    fireEvent.click(rangeRadio);

    expect(rangeRadio).toBeChecked();
    expect(
      container.querySelectorAll('button[aria-haspopup="dialog"]').length
    ).toBe(2);
  });

  test('buttons are disabled (label unchanged) while cinemas are loading', () => {
    const ui = makeUI();
    const setFilters = jest.fn();
    const onBeforeCommit = jest.fn();

    render(
      <Filters
        ui={ui}
        setFilters={setFilters}
        onBeforeCommit={onBeforeCommit}
        cinemaOptions={[]}
        loading={true}
      />
    );

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    const applyButton = screen.getByRole('button', { name: 'Apply' });

    expect(resetButton).toBeDisabled();
    expect(applyButton).toBeDisabled();
  });

  test('"Applying…" shows exactly while its own pending flag (pending.filters) is true', () => {
    const base = { ui: makeUI(), setFilters: jest.fn(), onBeforeCommit: jest.fn(), cinemaOptions: [] };
    const { rerender } = render(<Filters {...base} pending={false} />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    rerender(<Filters {...base} pending={true} />);
    expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
  });

  describe('unapplied draft survives re-renders', () => {
    const cinemas = [
      { id: 1, name: 'Rio Theatre' },
      { id: 2, name: 'VIFF Centre' },
    ];
    const tickRio = () => fireEvent.click(screen.getByLabelText(/Rio Theatre/));
    const rioBox = () => screen.getByLabelText(/Rio Theatre/);

    test('re-render with an equal (new-identity) ui keeps the draft', () => {
      const props = { setFilters: jest.fn(), onBeforeCommit: jest.fn(), cinemaOptions: cinemas };
      const { rerender } = render(<Filters ui={makeUI()} {...props} />);
      tickRio();
      expect(rioBox()).toBeChecked();
      rerender(<Filters ui={makeUI()} {...props} />);
      expect(rioBox()).toBeChecked();
    });

    test('a search-only URL change (q) keeps the draft', () => {
      const props = { setFilters: jest.fn(), onBeforeCommit: jest.fn(), cinemaOptions: cinemas };
      const { rerender } = render(<Filters ui={makeUI()} {...props} />);
      tickRio();
      rerender(<Filters ui={makeUI({ q: 'the' })} {...props} />);
      expect(rioBox()).toBeChecked();
    });

    test('a real filter change from the URL (Apply / back) re-syncs the draft', () => {
      const props = { setFilters: jest.fn(), onBeforeCommit: jest.fn(), cinemaOptions: cinemas };
      const { rerender } = render(<Filters ui={makeUI()} {...props} />);
      tickRio();
      rerender(<Filters ui={makeUI({ cinemaIds: ['2'] })} {...props} />);
      expect(rioBox()).not.toBeChecked();
      expect(screen.getByLabelText(/VIFF Centre/)).toBeChecked();
    });
  });
});