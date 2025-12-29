import { render, screen } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';

vi.mock('../lib/data', () => ({
  ALLOCATION_OPTIONS: ['Aerial'],
  isMiscProductCode: () => false,
}));

const baseProps = {
  wo: 'WO',
  product: { code: '111', desc:'Item', posted: 1, returned: 0, isCable:false },
  getItemState: () => ({ base:{}, extra:{ allocations:[{id:'X', type:'regular', qty:1}] , assets:{} }, totalAvailable:1, allocatedSum:1, remaining:0 }),
  upsertAllocation: vi.fn(), removeAllocation: vi.fn(),
  setAssetId: vi.fn(), setAssetMeta: vi.fn(),
  setReelSpan: vi.fn(), removeReelSpan: vi.fn(), getReelSpan: () => ({start:'', end:''}), listReels: () => [],
  addReelAllocation: vi.fn(),
  locked:false
};

test('COE headers appear in Engineering', () => {
  render(<ProductCard {...baseProps} tab="engineering" />);
  expect(screen.getByText(/COE LOC/i)).toBeInTheDocument();
  expect(screen.getByText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(screen.getByText(/SEPCAT/i)).toBeInTheDocument();
});

test('COE headers appear in Accounting', () => {
  render(<ProductCard {...baseProps} tab="accounting" />);
  expect(screen.getByText(/COE LOC/i)).toBeInTheDocument();
  expect(screen.getByText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(screen.getByText(/SEPCAT/i)).toBeInTheDocument();
});
