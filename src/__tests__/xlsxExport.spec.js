{/* Test the XLSX export with a mock */}

import { exportAllocationsToXLSX, buildAllocationRows } from '../lib/xlsxExport';

beforeEach(() => {
  vi.clearAllMocks();
});

test('export creates a sheet with rows', async () => {
  const grouped = new Map();
  const inner = new Map();
  inner.set('111', { code: '111', desc: 'FIBER', posted: 8, returned: 0 });
  grouped.set('WO1', inner);

  const allocState = {};
  const keyOf = (wo, code) => `${wo}|${code}`;

  const getItemState = () => ({
    extra: {
      allocations: [
        { id: 'X', type: 'regular', qty: 5, allocationId: 'A', allocationCategory: 'Aerial' },
      ],
    },
  });

  const addRow = vi.fn();
  const addWorksheet = vi.fn(() => ({ addRow, columns: [] }));
  const workbook = { addWorksheet, xlsx: { writeBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))) } };
  const download = vi.fn(() => Promise.resolve());

  await exportAllocationsToXLSX(
    {
      workOrders: ['WO1'],
      grouped,
      getItemState,
      keyOf,
      allocState,
    },
    { createWorkbook: () => workbook, download },
  );

  expect(addWorksheet).toHaveBeenCalledWith('Allocations');
  expect(addRow).toHaveBeenCalled();
  expect(download).toHaveBeenCalledWith(workbook, expect.stringMatching(/allocations_/));
});

test('export maps asset meta (COE fields)', () => {
  const grouped = new Map();
  const inner = new Map();
  inner.set('111', { code: '111', desc: 'FIBER', posted: 1, returned: 0 });
  grouped.set('WO1', inner);
  const keyOf = (wo, code) => `${wo}|${code}`;

  const getItemState = () => ({
    extra: { allocations: [{ id: 'A', type:'regular', qty:1, allocationId:'X' }] }
  });
  const allocState = {
    'WO1|111': {
      assets: { A: { assetId:'AS-1', coeLoc:'LOC1', rackBay:'R1B2', sepcat:'CAT-A' } }
    }
  };

  const rowsArg = buildAllocationRows({ workOrders:['WO1'], grouped, getItemState, keyOf, allocState });
  expect(rowsArg[0]).toMatchObject({
    AssetId: 'AS-1', COE_LOC:'LOC1', RACK_BAY:'R1B2', SEPCAT:'CAT-A'
  });
});
