import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProductCard from '../components/ProductCard.jsx';
import { useAllocations } from '../hooks/useAllocations';

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
  expect(within(allocationCard).queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
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
  expect(within(allocationCard).queryByPlaceholderText(/COE LOC/i)).not.toBeInTheDocument();
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

const makeAllocatedStateWithMeta = () => ({
  base: {},
  extra: {
    allocations: [
      {
        id: "asset-with-meta",
        type: "regular",
        qty: 1,
        allocationCategory: "SCXR",
      },
    ],
    assets: {
      "asset-with-meta": { coeLoc: "LOC-1", rackBay: "RB-1", sepcat: "411J" },
    },
  },
  totalAvailable: 1,
  allocatedSum: 1,
  pendingReturnSum: 0,
  returnedSum: 0,
  netAllocated: 1,
  remaining: 0,
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

test('SCXR allocation card displays stored COE/RACK/SEPCAT metadata', () => {
  render(
    <ProductCard
      {...baseProps}
      getItemState={() => makeAllocatedStateWithMeta()}
      tab="engineering"
    />,
  );
  const allocationCard = screen.getAllByText(/Quantity allocation/i)[0].closest(".rounded-2xl");
  const allocationWithin = within(allocationCard);
  expect(allocationWithin.getByText("LOC-1")).toBeInTheDocument();
  expect(allocationWithin.getByText("RB-1")).toBeInTheDocument();
  expect(allocationWithin.getByText("411J")).toBeInTheDocument();
});

test('SCXR asset metadata persists when submitting add asset form', async () => {
  const grouped = new Map();
  const product = { code: '111', desc: 'Item', posted: 2, returned: 0, group: 'SCXR' };
  const productMap = new Map();
  productMap.set(product.code, product);
  grouped.set('WO1', productMap);

  function Harness() {
    const allocations = useAllocations(grouped);
    return (
      <ProductCard
        wo="WO1"
        product={product}
        getItemState={allocations.getItemState}
        upsertAllocation={allocations.upsertAllocation}
        removeAllocation={allocations.removeAllocation}
        setAssetMeta={allocations.setAssetMeta}
        setReelSpan={allocations.setReelSpan}
        removeReelSpan={allocations.removeReelSpan}
        getReelSpan={allocations.getReelSpan}
        listReels={allocations.listReels}
        getReelSpanMap={allocations.getReelSpanMap}
        setCableMode={allocations.setCableMode}
        addReelAllocation={allocations.addReelAllocation}
        updateAllocation={allocations.updateAllocation}
        tab="engineering"
        locked={false}
      />
    );
  }

  render(<Harness />);

  fireEvent.change(screen.getByPlaceholderText(/COE LOC/i), { target: { value: "COE TEST 1" } });
  fireEvent.change(screen.getByPlaceholderText(/RACK\/BAY/i), { target: { value: "RB TEST 1" } });
  fireEvent.change(screen.getByLabelText(/SEPCAT/i), { target: { value: "411J" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Add Asset/i }));

  const allocationCard = await screen.findAllByText(/Quantity allocation/i);
  const allocationWithin = within(allocationCard[0].closest(".rounded-2xl"));

  await waitFor(() => {
    expect(allocationWithin.getByText("COE TEST 1")).toBeInTheDocument();
  });
  expect(allocationWithin.getByText("RB TEST 1")).toBeInTheDocument();
  expect(allocationWithin.getByText("411J")).toBeInTheDocument();
});
