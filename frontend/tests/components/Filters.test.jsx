import { render, screen, fireEvent } from '@testing-library/react';
import Filters from '@/components/screenings/Filters';

// Build a minimal UIState-like object
function makeUI(overrides = {}) {
  return {
    q: '',
    cinemaIds: [],
    filmId: '',
    date: '',
    from: '',
    to: '',
    sort: 'time',
    order: 'asc',
    mode: 'single',
    limit: 50,
    ...overrides,
  };
}

describe('Filters component', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders basic controls (search, cinemas, sort, order, mode, buttons)', () => {
    const ui = makeUI();
    const setUI = jest.fn();
    const onApply = jest.fn();

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
        cinemaOptions={[]}
      />
    );

    // Search input
    expect(
      screen.getByPlaceholderText('Title, director…')
    ).toBeInTheDocument();

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

  test('updates search query and calls setUI + onApply when typing', () => {
    const ui = makeUI({ q: '' });
    const setUI = jest.fn();
    const onApply = jest.fn();

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
        cinemaOptions={[]}
      />
    );

    const input = screen.getByPlaceholderText('Title, director…');

    fireEvent.change(input, { target: { value: 'Ozu' } });

    expect(setUI).toHaveBeenCalledTimes(1);
    expect(setUI).toHaveBeenCalledWith({
      ...ui,
      q: 'Ozu',
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test('selecting and clearing cinemas updates the summary text', () => {
    const ui = makeUI();
    const setUI = jest.fn();
    const onApply = jest.fn();

    const cinemaOptions = [
      { id: 1, name: 'Cinema One' },
      { id: 2, name: 'Cinema Two' },
    ];

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
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

  test('Apply button sends local filters (except q) via setUI and calls onApply', () => {
    const ui = makeUI({ q: 'hello' });
    const setUI = jest.fn();
    const onApply = jest.fn();

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
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

    expect(setUI).toHaveBeenCalledTimes(1);
    expect(setUI).toHaveBeenCalledWith({
      ...ui,
      sort: 'title',
      order: 'desc',
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test('Reset button resets filters to default values and calls setUI + onApply', () => {
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

    const setUI = jest.fn();
    const onApply = jest.fn();

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
        cinemaOptions={[]}
      />
    );

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(resetButton);

    expect(setUI).toHaveBeenCalledTimes(1);
    expect(setUI).toHaveBeenCalledWith({
      q: '',
      cinemaIds: [],
      filmId: '',
      date: '',
      from: '',
      to: '',
      sort: 'time',
      order: 'asc',
      mode: 'single',
      limit: ui.limit,
    });
    expect(onApply).toHaveBeenCalledTimes(1);

    // Summary text also reflects cleared cinemas
    expect(
      screen.getByText('Showing all cinemas')
    ).toBeInTheDocument();
  });

  test('switching between Single date and Date range toggles date inputs', () => {
    const ui = makeUI({ mode: 'single' });
    const setUI = jest.fn();
    const onApply = jest.fn();

    const { container } = render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
        cinemaOptions={[]}
      />
    );

    const singleRadio = screen.getByLabelText('Single date');
    const rangeRadio = screen.getByLabelText('Date range');

    expect(singleRadio).toBeChecked();
    // In "single" mode there should be 1 date input
    expect(
      container.querySelectorAll('input[type="date"]').length
    ).toBe(1);

    // Switch to "range" mode
    fireEvent.click(rangeRadio);

    expect(rangeRadio).toBeChecked();
    // In "range" mode there should be 2 date inputs
    expect(
      container.querySelectorAll('input[type="date"]').length
    ).toBe(2);
  });

  test('buttons are disabled and label changes when loading is true', () => {
    const ui = makeUI();
    const setUI = jest.fn();
    const onApply = jest.fn();

    render(
      <Filters
        ui={ui}
        setUI={setUI}
        onApply={onApply}
        cinemaOptions={[]}
        loading={true}
      />
    );

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    const applyButton = screen.getByRole('button', { name: 'Applying…' });

    expect(resetButton).toBeDisabled();
    expect(applyButton).toBeDisabled();
  });
});