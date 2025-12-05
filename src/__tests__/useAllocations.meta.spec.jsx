import { renderHook, act } from '@testing-library/react';
import { useAllocations } from '../hooks/useAllocations';

test('setAssetMeta stores partial COE fields', () => {
  const gm = new Map(); const inner = new Map();
  inner.set('111', { code:'111', desc:'Item', posted:1, returned:0 });
  gm.set('WO1', inner);
  const { result } = renderHook(() => useAllocations(gm));
  act(() => result.current.upsertAllocation('WO1','111',{ type:'regular', qty:1, allocationId:'A' }));
  const id = result.current.getItemState('WO1','111').extra.allocations[0].id;
  act(() => result.current.setAssetMeta('WO1','111', id, { assetId:'AS-1', coeLoc:'L1' }));
  const s = result.current.allocState[result.current.keyOf('WO1','111')];
  expect(s.assets[id]).toMatchObject({ assetId:'AS-1', coeLoc:'L1', rackBay:'', sepcat:'' });
});
