import { render, screen } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';

vi.mock('../lib/data', () => ({
  ALLOCATION_OPTIONS: ['Aerial'],
  isMiscProductCode: () => false,
}));

const baseProduct = { code: '111', desc: 'Item', posted: 1, returned: 0, isCable:false, group: 'SCXR' };
const baseProps = {
  wo: 'WO',
  product: baseProduct,
  getItemState: () => ({ base:{}, extra:{ allocations:[{id:'X', type:'regular', qty:1}] , assets:{} }, totalAvailable:1, allocatedSum:1, remaining:0 }),
  upsertAllocation: vi.fn(), removeAllocation: vi.fn(),
  setAssetId: vi.fn(), setAssetMeta: vi.fn(),
  setReelSpan: vi.fn(), removeReelSpan: vi.fn(), getReelSpan: () => ({start:'', end:''}), listReels: () => [],
  addReelAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  locked:false
};

test('SCXR allocations show COE inputs in Engineering', () => {
  render(<ProductCard {...baseProps} tab="engineering" />);
  expect(screen.getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/SEPCAT/i)).toBeInTheDocument();
});

test('SCXR allocations show COE inputs in Accounting', () => {
  render(<ProductCard {...baseProps} tab="accounting" />);
  expect(screen.getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/SEPCAT/i)).toBeInTheDocument();
});

test('Non-SCXR allocations hide COE inputs in Engineering', () => {
  render(<ProductCard {...baseProps} product={{ ...baseProps.product, group: 'OTHER' }} tab="engineering" />);
  expect(screen.queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/RACK\/BAY/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/SEPCAT/i)).not.toBeInTheDocument();
});

test('Non-SCXR allocations hide COE inputs in Accounting', () => {
  render(<ProductCard {...baseProps} product={{ ...baseProps.product, group: 'OTHER' }} tab="accounting" />);
  expect(screen.queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/RACK\/BAY/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/SEPCAT/i)).not.toBeInTheDocument();
});
