import { renderHook, act } from '@testing-library/react';
import { useAllocations } from '../hooks/useAllocations';

const makeGrouped = () => {
  const gm = new Map();
  const inner = new Map();
  // SCXR item with 1 available
  inner.set('111', { code:'111', desc:'FIBER', posted:1, returned:0, isCable:true, group:'SCXR' });
  gm.set('WO1', inner);
  return gm;
};

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

test('SCXR requires Asset ID + COE LOC + RACK/BAY + SEPCAT', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));
  // add one reel piece covering all available
  act(() => {
    result.current.upsertAllocation('WO1','111', { type:'reel', outer:0, inner:1, footage:1, allocationId:'R1', reelSerial:'REEL-1' });
  });
  // Set only Asset ID -> leave COE fields missing
  const alloc = result.current.getItemState('WO1','111').extra.allocations[0];
  act(() => {
    result.current.setAssetMeta('WO1','111', alloc.id, { assetId:'AS-1' });
  });
  act(() => { result.current.lockWorkOrder('WO1'); });
  const msg = window.alert.mock.calls[0][0];
  expect(msg).toMatch(/SCXR requires/i);
  expect(msg).toMatch(/COE LOC/i);
  expect(msg).toMatch(/RACK\/BAY/i);
  expect(msg).toMatch(/SEPCAT/i);
});

test('SCXR passes when all COE fields provided', () => {
  const grouped = makeGrouped();
  const { result } = renderHook(() => useAllocations(grouped));
  act(() => {
    result.current.upsertAllocation('WO1','111', { type:'reel', outer:0, inner:1, footage:1, allocationId:'R1', reelSerial:'REEL-1' });
  });
  const alloc = result.current.getItemState('WO1','111').extra.allocations[0];
  act(() => {
    result.current.setAssetMeta('WO1','111', alloc.id, { assetId:'AS-1', coeLoc:'LOC1', rackBay:'R1B2', sepcat:'CAT-A' });
  });
  act(() => { result.current.lockWorkOrder('WO1'); });
  // Should alert "marked complete" or at least not contain SCXR error
  const msg = window.alert.mock.calls[0][0];
  expect(msg).not.toMatch(/SCXR requires/i);
});