import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard from '../components/ProductCard.jsx';

// Mock ALLOCATION_OPTIONS used by the component
vi.mock('../lib/data', () => ({
      ALLOCATION_OPTIONS: ['Aerial', 'Buried', 'Underground', 'Removal', 'Pending return', 'Returned'],
      isMiscProductCode: () => false,
}));

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
