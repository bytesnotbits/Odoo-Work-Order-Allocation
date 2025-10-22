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
      type:'reel', outer:0, inner:8, footage:8, allocationId:'R1', reelSerial:'REEL-1'
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