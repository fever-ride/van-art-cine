// jest.setup.js
import '@testing-library/jest-dom'

// jsdom does not implement ResizeObserver. Components that use it (e.g.
// Filters.tsx, to detect cinema list overflow) throw "ResizeObserver is
// not defined" in tests without this stub.
global.ResizeObserver = global.ResizeObserver || class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};