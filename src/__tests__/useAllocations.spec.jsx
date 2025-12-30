import { renderHook, act } from '@testing-library/react'
import { useAllocations } from '../hooks/useAllocations'

// Build a simple grouped map: Map<WO, Map<code, item>>
const makeGrouped = () => {
  const gm = new Map()
  const inner = new Map()
  // 111 = fiber (available = 8), 190 = pole (available = 2)
  inner.set('111', { code:'111', desc:'FIBER', posted: 10, returned: 2, isCable: true })
  inner.set('190', { code:'190', desc:'POLE',  posted:  2, returned: 0, isCable: false })
  gm.set('WO1', inner)
  return gm
}

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {}) // silence alert popups
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('allocation sums and remaining', () => {
  const grouped = makeGrouped()
  const { result } = renderHook(() => useAllocations(grouped))

  act(() => {
    result.current.upsertAllocation('WO1','190',{ type:'regular', qty:1, allocationId:'A1' })
  })

  const s = result.current.getItemState('WO1','190')
  expect(s.totalAvailable).toBe(2)
  expect(s.allocatedSum).toBe(1)
  expect(s.remaining).toBe(1)
});

test('typed custom categories do not count toward allocated', () => {
  const grouped = makeGrouped()
  const { result } = renderHook(() => useAllocations(grouped))

  act(() => {
    // User chose Custom… and typed "SCRAP"
    result.current.upsertAllocation('WO1','190',{
      type:'regular',
      qty:2,
      allocationCategory:'SCRAP',        // arbitrary user text
      allocationCategoryIsCustom:true    // the flag makes it non-allocating
    })
  })

  const s = result.current.getItemState('WO1','190')
  expect(s.allocatedSum).toBe(0)
  expect(s.remaining).toBe(2) // posted 2 for item 190 in the fixture
})

test('lockWorkOrder reports issues for unallocated/asset-missing', () => {
  const grouped = makeGrouped()
  const { result } = renderHook(() => useAllocations(grouped))

  act(() => {
    // allocate all of POLE (ok), leave FIBER unallocated to trigger "Unallocated"
    result.current.upsertAllocation('WO1','190',{ type:'regular', qty:2, allocationId:'A2' })
  })

  act(() => { result.current.lockWorkOrder('WO1') })
  expect(window.alert).toHaveBeenCalled()
  const msg = window.alert.mock.calls[0][0]
  expect(msg).toMatch(/Unallocated material/i)
})

test('lockWorkOrder succeeds when everything allocated & asseted', () => {
  const grouped = makeGrouped()
  const { result } = renderHook(() => useAllocations(grouped))

  // 1) add allocations (state update)
  act(() => {
    // FIBER: allocate 8 as a single reel piece within some span (span not required for success)
    result.current.upsertAllocation('WO1','111', {
      type:'reel', outer:0, inner:10, footage:10, allocationId:'R1', reelSerial:'REEL-1'
    })
    // POLE: allocate 2
    result.current.upsertAllocation('WO1','190', {
      type:'regular', qty:2, allocationId:'A2'
    })
  })

  // 2) read after state flush
  const fiberAlloc = result.current.getItemState('WO1','111').extra.allocations[0]
  const poleAlloc  = result.current.getItemState('WO1','190').extra.allocations[0]
  expect(fiberAlloc).toBeTruthy()
  expect(poleAlloc).toBeTruthy()

  // 3) set asset IDs (another state update)
  act(() => {
    result.current.setAssetId('WO1','111', fiberAlloc.id, 'ASSET-F')
    result.current.setAssetId('WO1','190',  poleAlloc.id,  'ASSET-P')
  })

  // 4) lock should complete successfully
  act(() => { result.current.lockWorkOrder('WO1') })
  expect(window.alert).toHaveBeenCalled()
  const msg = window.alert.mock.calls[0][0]
  expect(msg).toMatch(/marked complete/i)
})

test('pending return entries do not consume remaining footage', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));

  act(() => {
    result.current.upsertAllocation('WO1','190',{
      type: 'regular',
      qty: 1,
      allocationCategory: 'Pending'
    });
  });

  const s = result.current.getItemState('WO1','190');
  expect(s.allocatedSum).toBe(0);
  expect(s.pendingReturnSum).toBe(1);
  expect(s.remaining).toBe(2);
});

test('returned allocations do not affect remaining', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));

  act(() => {
    result.current.upsertAllocation('WO1','190',{ type:'regular', qty:2, allocationCategory:'Aerial' });
    result.current.upsertAllocation('WO1','190',{ type:'regular', qty:1, allocationCategory:'Returned' });
  });

  const s = result.current.getItemState('WO1','190');
  expect(s.allocatedSum).toBe(2);
  expect(s.returnedSum).toBe(1);
  expect(s.netAllocated).toBe(2);
  expect(s.remaining).toBe(0);
});

test('addReelAllocation splits pending return spans when returning a subset', () => {
  const grouped = makeGrouped({ posted: 5000, returned: 0 });
  const { result } = renderHook(() => useAllocations(grouped));

  act(() => {
    result.current.upsertAllocation('WO1','111', {
      type: 'reel',
      outer: 0,
      inner: 5000,
      allocationCategory: 'Pending',
      reelSerial: 'R1',
      footage: 5000,
    });
  });

  let response;
  act(() => {
    response = result.current.addReelAllocation('WO1','111', {
      type: 'reel',
      outer: 0,
      inner: 2600,
      allocationCategory: 'Returned',
      allocationId: 'RETURN-1',
      reelSerial: 'R1',
    });
  });

  expect(response?.success).toBe(true);
  const allocations = result.current.getItemState('WO1','111').extra.allocations;
  expect(allocations).toHaveLength(2);
  const returnedPiece = allocations.find((a) => a.allocationCategory === 'Returned');
  expect(returnedPiece).toBeTruthy();
  expect(Math.min(returnedPiece.inner, returnedPiece.outer)).toBe(0);
  expect(Math.max(returnedPiece.inner, returnedPiece.outer)).toBe(2600);
  const pendingPiece = allocations.find((a) => a.allocationCategory === 'Pending');
  expect(pendingPiece).toBeTruthy();
  expect(Math.min(pendingPiece.inner, pendingPiece.outer)).toBe(2600);
  expect(Math.max(pendingPiece.inner, pendingPiece.outer)).toBe(5000);
});

test('updateAllocation mutates the existing regular allocation', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));

  act(() => {
    result.current.upsertAllocation('WO1','190',{ type:'regular', qty:1, allocationCategory:'Aerial', allocationId:'A1' });
  });

  const alloc = result.current.getItemState('WO1','190').extra.allocations[0];
  act(() => {
    result.current.updateAllocation('WO1','190', alloc.id, { qty: 2, allocationCategory: 'Removal', allocationId: 'A2' });
  });

  const updated = result.current.getItemState('WO1','190').extra.allocations.find((a) => a.id === alloc.id);
  expect(updated.qty).toBe(2);
  expect(updated.allocationCategory).toBe('Removal');
  expect(updated.allocationId).toBe('A2');
});

test('addReelAllocation keeps the ID when replacing a reel entry', () => {
  const grouped = makeGrouped({ posted: 5000, returned: 0 });
  const { result } = renderHook(() => useAllocations(grouped));

  act(() => {
    result.current.upsertAllocation('WO1','111', {
      type: 'reel',
      outer: 0,
      inner: 5000,
      allocationCategory: 'Pending',
      reelSerial: 'R1',
      footage: 5000,
    });
  });

  const pendingAlloc = result.current.getItemState('WO1','111').extra.allocations[0];
  act(() => {
    result.current.addReelAllocation('WO1','111', {
      type: 'reel',
      outer: 0,
      inner: 2600,
      allocationCategory: 'Returned',
      allocationId: 'RETURN-1',
      reelSerial: 'R1',
    }, { replaceId: pendingAlloc.id });
  });

  const allocations = result.current.getItemState('WO1','111').extra.allocations;
  const returned = allocations.find((a) => a.allocationCategory === 'Returned');
  expect(returned).toBeTruthy();
  expect(returned.id).toBe(pendingAlloc.id);
  const pendingRemaining = allocations.find((a) => a.allocationCategory === 'Pending');
  expect(pendingRemaining).toBeTruthy();
  expect(Math.min(pendingRemaining.inner, pendingRemaining.outer)).toBe(2600);
});

test('cableMode toggles independently of heuristic', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));

  // FIBER isCable: true but cableMode default should be false
  let s = result.current.getItemState('WO1', '111');
  expect(s.cableSuggested).toBe(true);
  expect(s.cableMode).toBe(false);

  act(() => result.current.setCableMode('WO1', '111', true));

  s = result.current.getItemState('WO1', '111');
  expect(s.cableMode).toBe(true);
});
