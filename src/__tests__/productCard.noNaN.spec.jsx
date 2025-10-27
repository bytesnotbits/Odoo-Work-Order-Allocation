import { render, screen } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';

vi.mock('../lib/data', () => ({
  ALLOCATION_OPTIONS: ['Aerial'],
}));

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
  getReelSpan: () => ({ start: '', end: '' }),
  listReels: () => [],
};

test('does not render stray "+ NaN"', () => {
  const { container } = render(<ProductCard {...baseProps} />);
  expect(screen.getByText(/\[ITEM-1]/)).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/\bNaN\b/);
});
