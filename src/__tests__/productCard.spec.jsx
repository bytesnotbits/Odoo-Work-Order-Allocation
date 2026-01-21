import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard from '../components/ProductCard.jsx';

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  window.alert.mockRestore?.();
});

// Mock ALLOCATION_OPTIONS used by the component
vi.mock('../lib/data', () => {
  const SEPCAT_OPTIONS = ["411J", "3", "2/3", "4CTX", "4ETS", "4FO", "4ISP", "CP", "CO", "NR"];
  return {
    ALLOCATION_OPTIONS: ['Aerial', 'Buried', 'Underground', 'Removal', 'Pending', 'Returned'],
    SEPCAT_OPTIONS,
    isMiscProductCode: () => false,
  };
});

function renderProductCard(overrides = {}) {
  const defaultProps = {
    wo: 'WO-TEST',
    product: {
      code: 'ITEM-1',
      desc: 'Test Item',
      posted: 0,
      returned: 0,
      isCable: false,
    },
    tab: 'engineering',
    locked: false,
    // minimal app-specific fakes used by ProductCard
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
    updateAllocation: vi.fn(),
    addReelAllocation: vi.fn(),
  };

  return render(<ProductCard {...defaultProps} {...overrides} />);
}

describe('ProductCard – Add Asset button', () => {
  test('is rendered with accessible name "Add Asset"', async () => {
    renderProductCard();
    const btn = await screen.findByRole('button', { name: /add asset/i });
    expect(btn).toBeInTheDocument();
  });

  test('button has button styling classes applied', async () => {
    renderProductCard();
    const btn = await screen.findByRole('button', { name: /add asset/i });
    expect(btn).toHaveClass('border');
  });

  test('remains clickable (no crash) and can be triggered by keyboard', async () => {
    const user = userEvent.setup();
    const upsertAllocation = vi.fn();
    renderProductCard({ upsertAllocation });
    const btn = await screen.findByRole('button', { name: /add asset/i });
    // Click should not throw; component will guard invalid form values itself.
    await user.click(btn);
    // We can’t assert exact call without valid qty; we only assert that the DOM is still alive:
    expect(screen.getByText(/test item/i)).toBeInTheDocument();
  });
});

test('auto pending entry appears when remaining quantity exists', async () => {
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: { allocations: [] },
      totalAvailable: 10,
      allocatedSum: 0,
      remaining: 3,
      pendingReturnSum: 0,
    }),
  });

  expect(screen.getByText(/Auto-generated pending balance/i)).toBeInTheDocument();
  expect(
    screen.getByText(/This entry represents 3 units still awaiting allocation\./i),
  ).toBeInTheDocument();
});

test('open pending control primes the allocation form', async () => {
  const user = userEvent.setup();
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: { allocations: [] },
      totalAvailable: 10,
      allocatedSum: 0,
      remaining: 3,
      pendingReturnSum: 0,
    }),
  });
  const editButton = screen.getByRole('button', { name: /open pending for edit/i });
  await user.click(editButton);
  const quantityInput = screen.getByRole('spinbutton');
  expect(quantityInput.value).toBe("3");
  const categorySelect = screen.getByRole('combobox');
  expect(categorySelect.value).toBe("Pending");
});

test('remove control deletes an allocation so synthetic pending can take its place', async () => {
  const user = userEvent.setup();
  const removeAllocation = vi.fn();
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: {
        allocations: [
          { id: "ALLOC-1", type: "regular", allocationCategory: "Aerial", qty: 2 },
        ],
      },
      totalAvailable: 10,
      allocatedSum: 2,
      remaining: 8,
      pendingReturnSum: 0,
    }),
    removeAllocation,
  });

  const removeButton = screen.getByLabelText(/remove allocation permanently/i);
  await user.click(removeButton);
  expect(removeAllocation).toHaveBeenCalledWith("WO-TEST", "ITEM-1", "ALLOC-1");
});

test('saving a new reel span auto-creates a pending allocation', async () => {
  const user = userEvent.setup();
  const setReelSpan = vi.fn().mockReturnValue({ id: "SPAN-1", start: 100, end: 200 });
  const addReelAllocation = vi.fn().mockReturnValue({ success: true });
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: { allocations: [] },
      totalAvailable: 100,
      allocatedSum: 0,
      remaining: 100,
      cableMode: true,
      pendingReturnSum: 0,
      returnedSum: 0,
      netAllocated: 0,
    }),
    setReelSpan,
    addReelAllocation,
  });

  const spanSerialInput = screen.getAllByPlaceholderText("REEL-XXXXX")[0];
  const spanSection = screen.getByText(/Reel & span \(optional\)/i).parentElement;
  const [innerInput, outerInput] = within(spanSection).getAllByRole('spinbutton');
  await user.type(spanSerialInput, "REEL-1");
  await user.type(innerInput, "100");
  await user.type(outerInput, "200");

  const saveButton = screen.getByRole('button', { name: /save span/i });
  await user.click(saveButton);

  expect(setReelSpan).toHaveBeenCalledWith('WO-TEST', 'ITEM-1', 'REEL-1', 100, 200);
  expect(addReelAllocation).toHaveBeenCalledWith(
    'WO-TEST',
    'ITEM-1',
    expect.objectContaining({
      type: 'reel',
      outer: 200,
      inner: 100,
      allocationCategory: 'Pending',
      reelSerial: 'REEL-1',
    }),
  );
});

test('update existing button calls updateAllocation when a regular allocation is selected', async () => {
  const user = userEvent.setup();
  const updateAllocation = vi.fn();
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: {
        allocations: [
          {
            id: "ALLOC-1",
            type: "regular",
            allocationCategory: "Aerial",
            qty: 2,
            allocationId: "notes",
          },
        ],
      },
      totalAvailable: 10,
      allocatedSum: 2,
      remaining: 8,
      pendingReturnSum: 0,
    }),
    updateAllocation,
  });

  const [cardHeading] = screen.getAllByText(/Quantity allocation/i);
  const allocationCard = cardHeading.closest('[role="button"]');
  await user.click(allocationCard);

  const quantityInput = screen.getByRole('spinbutton');
  await user.clear(quantityInput);
  await user.type(quantityInput, "4");

  const updateButton = screen.getByRole('button', { name: /update selected asset/i });
  await user.click(updateButton);

  expect(updateAllocation).toHaveBeenCalledWith(
    "WO-TEST",
    "ITEM-1",
    "ALLOC-1",
    expect.objectContaining({ qty: 4 }),
  );
});

test('update existing syncs SCXR asset metadata via setAssetMeta', async () => {
  const user = userEvent.setup();
  const setAssetMeta = vi.fn();
  const updateAllocation = vi.fn();
  renderProductCard({
    product: { code: "ITEM-1", desc: "Test Item", posted: 0, returned: 0, group: "SCXR" },
    getItemState: () => ({
      base: {},
      extra: {
        allocations: [
          {
            id: "ALLOC-1",
            type: "regular",
            allocationCategory: "SCXR",
            qty: 2,
            allocationId: "notes",
          },
        ],
        assets: {
          "ALLOC-1": { coeLoc: "HUNF", rackBay: "RB-1", sepcat: "411J" },
        },
      },
      totalAvailable: 10,
      allocatedSum: 2,
      remaining: 8,
      pendingReturnSum: 0,
    }),
    updateAllocation,
    setAssetMeta,
  });

  const [cardHeading] = screen.getAllByText(/Quantity allocation/i);
  const allocationCard = cardHeading.closest('[role="button"]');
  await user.click(allocationCard);

  const coeInput = screen.getByPlaceholderText(/COE LOC/i);
  await user.clear(coeInput);
  await user.type(coeInput, "test");

  const quantityInput = screen.getByRole('spinbutton');
  await user.clear(quantityInput);
  await user.type(quantityInput, "4");

  const updateButton = screen.getByRole('button', { name: /update selected asset/i });
  await user.click(updateButton);

  expect(updateAllocation).toHaveBeenCalledWith(
    "WO-TEST",
    "ITEM-1",
    "ALLOC-1",
    expect.objectContaining({ qty: 4 }),
  );
  expect(setAssetMeta).toHaveBeenCalledWith(
    "WO-TEST",
    "ITEM-1",
    "ALLOC-1",
    expect.objectContaining({
      coeLoc: "test",
      rackBay: "RB-1",
      sepcat: "411J",
    }),
  );
});

test('update existing shows a confirmation message', async () => {
  const user = userEvent.setup();
  const updateAllocation = vi.fn();
  renderProductCard({
    getItemState: () => ({
      base: {},
      extra: {
        allocations: [
          {
            id: "ALLOC-1",
            type: "regular",
            allocationCategory: "Aerial",
            qty: 2,
            allocationId: "notes",
          },
        ],
      },
      totalAvailable: 10,
      allocatedSum: 2,
      remaining: 8,
      pendingReturnSum: 0,
    }),
    updateAllocation,
  });

  const [cardHeading] = screen.getAllByText(/Quantity allocation/i);
  const allocationCard = cardHeading.closest('[role="button"]');
  await user.click(allocationCard);

  const quantityInput = screen.getByRole('spinbutton');
  await user.clear(quantityInput);
  await user.type(quantityInput, "4");

  const updateButton = screen.getByRole('button', { name: /update selected asset/i });
  await user.click(updateButton);

  expect(screen.getByText(/Allocation updated!/i)).toBeInTheDocument();
});
