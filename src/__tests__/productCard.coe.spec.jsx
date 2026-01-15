import { fireEvent, render, screen, within } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';

vi.mock('../lib/data', () => {
  const SEPCAT_OPTIONS = ["411J", "3", "2/3", "4CTX", "4ETS", "4FO", "4ISP", "CP", "CO", "NR"];
  return {
    ALLOCATION_OPTIONS: ['Aerial'],
    SEPCAT_OPTIONS,
    isMiscProductCode: () => false,
  };
});

const baseProduct = { code: '111', desc: 'Item', posted: 1, returned: 0, isCable:false, group: 'SCXR' };
const baseProps = {
  wo: 'WO',
  product: baseProduct,
  getItemState: () => ({ base:{}, extra:{ allocations:[{id:'X', type:'regular', qty:1}] , assets:{} }, totalAvailable:1, allocatedSum:1, remaining:0 }),
  upsertAllocation: vi.fn(), removeAllocation: vi.fn(),
  setAssetId: vi.fn(), setAssetMeta: vi.fn(),
  setReelSpan: vi.fn(), removeReelSpan: vi.fn(), getReelSpan: () => ({start:'', end:''}), listReels: () => [], getReelSpanMap: () => ({}),
  addReelAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  locked:false
};

const getAddAllocationCard = () => screen.getByText(/Add allocation/i).parentElement;
const getFirstAllocationCard = () => screen.getByText(/Quantity allocation/i).closest(".rounded-2xl");

test('SCXR add allocation form surfaces COE inputs in Engineering', () => {
  render(<ProductCard {...baseProps} tab="engineering" />);
  const addAllocationCard = getAddAllocationCard();
  expect(within(addAllocationCard).getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
  expect(within(addAllocationCard).getByPlaceholderText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(within(addAllocationCard).getByLabelText(/SEPCAT/i)).toBeInTheDocument();
  const allocationCategorySelect = within(addAllocationCard).getByRole("combobox", { name: /Allocation Category/i });
  expect(allocationCategorySelect.value).toBe("SCXR");
  const allocationCard = getFirstAllocationCard();
  expect(allocationCard).toBeTruthy();
  expect(within(allocationCard).getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
});

test('SCXR add allocation form surfaces COE inputs in Accounting', () => {
  render(<ProductCard {...baseProps} tab="accounting" />);
  const addAllocationCard = getAddAllocationCard();
  expect(within(addAllocationCard).getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
  expect(within(addAllocationCard).getByPlaceholderText(/RACK\/BAY/i)).toBeInTheDocument();
  expect(within(addAllocationCard).getByLabelText(/SEPCAT/i)).toBeInTheDocument();
  const allocationCategorySelect = within(addAllocationCard).getByRole("combobox", { name: /Allocation Category/i });
  expect(allocationCategorySelect.value).toBe("SCXR");
  const allocationCard = getFirstAllocationCard();
  expect(allocationCard).toBeTruthy();
  expect(within(allocationCard).getByPlaceholderText(/COE LOC/i)).toBeInTheDocument();
});

test('Non-SCXR allocations hide COE inputs in Engineering', () => {
  render(<ProductCard {...baseProps} product={{ ...baseProps.product, group: 'OTHER' }} tab="engineering" />);
  expect(screen.queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/RACK\/BAY/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/SEPCAT/i)).not.toBeInTheDocument();
});

test('Non-SCXR allocations hide COE inputs in Accounting', () => {
  render(<ProductCard {...baseProps} product={{ ...baseProps.product, group: 'OTHER' }} tab="accounting" />);
  expect(screen.queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/RACK\/BAY/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/SEPCAT/i)).not.toBeInTheDocument();
});

const makeSyntheticState = () => ({
  base: {},
  extra: { allocations: [], assets: {} },
  totalAvailable: 2,
  allocatedSum: 0,
  pendingReturnSum: 0,
  returnedSum: 0,
  netAllocated: 0,
  remaining: 2,
  overAllocated: false,
  cableMode: false,
  cableSuggested: false,
  isMisc: false,
});

test('Editing synthetic pending keeps SCXR category', () => {
  render(
    <ProductCard
      {...baseProps}
      getItemState={() => makeSyntheticState()}
      tab="engineering"
    />,
  );

  const addAllocationCard = getAddAllocationCard();
  const allocationCategorySelect = within(addAllocationCard).getByRole("combobox", { name: /Allocation Category/i });
  const editPendingButton = screen.getByLabelText(/Open pending for edit/i);

  expect(allocationCategorySelect.value).toBe("SCXR");
  fireEvent.click(editPendingButton);
  expect(allocationCategorySelect.value).toBe("SCXR");
});
