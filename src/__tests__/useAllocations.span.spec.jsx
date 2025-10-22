{/*What these tests prove
Span bounds: A reel piece must lie fully within the saved [start, end] for that reel.
Cross-reel independence: Overlap checks only apply within the same reel serial. Overlaps on different reels do not block completion.*/}

import { renderHook, act } from '@testing-library/react';
import { useAllocations } from '../hooks/useAllocations';

const makeGrouped = ({ posted = 100, returned = 0 } = {}) => {
  // Map<WO, Map<code, item>>
  const gm = new Map();
  const inner = new Map();
  inner.set('111', { code: '111', desc: 'FIBER', posted, returned, isCable: true });
  gm.set('WO1', inner);
  return gm;
};

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {}); // silence UI popups
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reel span bounds & cross-reel independence', () => {
  test('lockWorkOrder flags piece outside saved span', () => {
    // Posted exactly equals the piece footage so no "unallocated" noise
    const grouped = makeGrouped({ posted: 20, returned: 0 });
    const { result } = renderHook(() => useAllocations(grouped));

    // Save span [100, 200] for reel R1
    act(() => {
      result.current.setReelSpan('WO1', '111', 'R1', 100, 200);
    });

    // Add a reel piece [90,110] -> starts before 100 (outside lower bound)
    act(() => {
      result.current.upsertAllocation('WO1', '111', {
        type: 'reel',
        outer: 90,
        inner: 110,
        footage: 20,
        allocationId: 'R1-OUTSIDE',
        reelSerial: 'R1',
      });
    });

    // Give it an Asset ID so the only failure is the span violation
    const alloc = result.current.getItemState('WO1', '111').extra.allocations[0];
    act(() => {
      result.current.setAssetId('WO1', '111', alloc.id, 'ASSET-1');
    });

    // Lock -> expect span failure
    act(() => {
      result.current.lockWorkOrder('WO1');
    });

    expect(window.alert).toHaveBeenCalled();
    const msg = window.alert.mock.calls[0][0];
    expect(msg).toMatch(/outside saved span/i);
  });

  test('overlaps are checked within the same reel, not across reels', () => {
    // Posted equals total of two pieces (40 + 30 = 70) -> no unallocated
    const grouped = makeGrouped({ posted: 70, returned: 0 });
    const { result } = renderHook(() => useAllocations(grouped));

    // Save the same span for two different reels
    act(() => {
      result.current.setReelSpan('WO1', '111', 'R1', 100, 200);
      result.current.setReelSpan('WO1', '111', 'R2', 100, 200);
    });

    // Add overlapping intervals *on different reels*:
    // R1: [100,140] (footage 40), R2: [120,150] (footage 30)
    act(() => {
      result.current.upsertAllocation('WO1', '111', {
        type: 'reel',
        outer: 100,
        inner: 140,
        footage: 40,
        allocationId: 'R1-A',
        reelSerial: 'R1',
      });
      result.current.upsertAllocation('WO1', '111', {
        type: 'reel',
        outer: 120,
        inner: 150,
        footage: 30,
        allocationId: 'R2-A',
        reelSerial: 'R2',
      });
    });

    // Asset IDs for both allocations so we don't fail on "missing asset"
    const allocs = result.current.getItemState('WO1', '111').extra.allocations;
    act(() => {
      for (const a of allocs) {
        result.current.setAssetId('WO1', '111', a.id, `ASSET-${a.reelSerial}`);
      }
    });

    // Lock should NOT complain about overlap (different reels),
    // and should mark complete (since 40+30 == posted 70 and all asseted)
    act(() => {
      result.current.lockWorkOrder('WO1');
    });

    expect(window.alert).toHaveBeenCalled();
    const msg = window.alert.mock.calls[0][0];
    expect(msg).toMatch(/marked complete/i);
    expect(msg).not.toMatch(/overlap/i);
  });
});