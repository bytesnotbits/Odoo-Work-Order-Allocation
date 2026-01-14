import { render, screen } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';

vi.mock('../lib/data', () => {
  const SEPCAT_OPTIONS = ["411J", "3", "2/3", "4CTX", "4ETS", "4FO", "4ISP", "CP", "CO", "NR"];
  return {
    ALLOCATION_OPTIONS: ['Aerial'],
    SEPCAT_OPTIONS,
    isMiscProductCode: () => false,
  };
});

const baseProps = {
  wo: 'WO-TEST',
  product: { code: 'ITEM-1', desc: 'Test Item', posted: 0, returned: 0, isCable: false },
  tab: 'engineering',
  locked: false,
  getItemState: () => ({
    base: {},
    extra: { allocations: [] },
    totalAvailable: 10,
    allocatedSum: 0,
    remaining: 10,
  }),
  upsertAllocation: vi.fn(),
  removeAllocation: vi.fn(),
  setAssetId: vi.fn(),
  setReelSpan: vi.fn(),
  removeReelSpan: vi.fn(),
  getReelSpan: () => ({ start: '', end: '' }),
  listReels: () => [],
  getReelSpanMap: () => ({}),
  addReelAllocation: vi.fn(),
  updateAllocation: vi.fn(),
};

test('does not render stray "+ NaN"', () => {
  const { container } = render(<ProductCard {...baseProps} />);
  expect(screen.getByText(/\[ITEM-1]/)).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/\bNaN\b/);
});
