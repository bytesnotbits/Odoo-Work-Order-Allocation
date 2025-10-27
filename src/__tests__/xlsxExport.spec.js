{/* Test the XLSX export with a mock */}

import { exportAllocationsToXLSX } from '../lib/xlsxExport'

// 1) Mock first (Vitest hoists this automatically)
vi.mock('xlsx', () => {
  const utils = {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  };
  return {
    utils,
    writeFile: vi.fn(),
  };
});

// 2) Then import the (mocked) module
import * as XLSX from 'xlsx';
import { exportAllocationsToXLSX } from '../lib/xlsxExport';

test('export creates a sheet with rows', () => {
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

  exportAllocationsToXLSX({
    workOrders: ['WO1'],
    grouped,
    getItemState,
    keyOf,
    allocState,
  });

  expect(XLSX.utils.json_to_sheet).toHaveBeenCalled();
  expect(XLSX.writeFile).toHaveBeenCalled();
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

  exportAllocationsToXLSX({ workOrders:['WO1'], grouped, getItemState, keyOf, allocState });
  const rowsArg = XLSX.utils.json_to_sheet.mock.calls[0][0];
  expect(rowsArg[0]).toMatchObject({
    AssetId: 'AS-1', COE_LOC:'LOC1', RACK_BAY:'R1B2', SEPCAT:'CAT-A'
  });
});