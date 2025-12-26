import { normalizeRow, parseProductFromLine, isReturnRow, isCable, groupRows } from '../lib/rows'

test('parseProductFromLine extracts [code] and description', () => {
  const { code, desc } = parseProductFromLine('W001629 - [1396R] FO 288R RIBBON FIBER')
  expect(code).toBe('1396R')
  expect(desc).toMatch(/RIBBON FIBER/i)
})

test('normalizeRow maps columns and types', () => {
  const r = normalizeRow({
    'WORK ORDER': '11880',
    'Item': '1396R',
    'Item Description': 'Fiber...',
    'Quantity Charged': '10',
    Customer: 'Acme'
  })
  expect(r.workOrder).toBe('11880')
  expect(r.deliveryQty).toBe(10)
  expect(r.customer).toBe('Acme')
  expect(r.code).toBe('1396R')
})

test('isReturnRow detects negative qty and "Return" lines', () => {
  expect(isReturnRow({ deliveryQty: -1, productLine: ''})).toBe(true)
  expect(isReturnRow({ deliveryQty: 1, productLine: 'Return - [1396R]' })).toBe(true)
})

test('isCable matches cable-like descriptions', () => {
  expect(isCable('FO 288R RIBBON FIBER')).toBe(true)
  expect(isCable('CAT 6 JUMPER')).toBe(true)
  expect(isCable('POLE, CLASS 5')).toBe(false)
})

test('groupRows builds posted/returned by WO + product code', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Order Lines':'[111] FIBER', 'Order Lines/Delivery Quantity': 10 }),
    normalizeRow({ 'WORK ORDER':'WO1', 'Order Lines':'Return - [111] FIBER', 'Order Lines/Delivery Quantity': -3 }),
  ]
  const g = groupRows(rows)
  const gm = g.get('WO1')
  const item = gm.get('111')
  expect(item.posted).toBe(10)
  expect(item.returned).toBe(3)
  expect(item.isCable).toBe(true)
})

test('normalizeRow + groupRows captures group column', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Order Lines':'[111] FIBER', 'Order Lines/Delivery Quantity': 1, group: 'SCXR' }),
  ];
  const g = groupRows(rows);
  const item = g.get('WO1').get('111');
  expect(item.group).toBe('SCXR');
});

test('groupRows skips MI Group EXPT - EXEMPT lines', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Item Description':'EXPT - EXEMPT', 'Quantity Charged': 5, 'MI Group':'MI Group' }),
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'ABC', 'Item Description':'Actual item', 'Quantity Charged': 2 }),
  ];
  const g = groupRows(rows);
  expect(g.get('WO1').size).toBe(1);
  expect(g.get('WO1').has('ABC')).toBe(true);
});

test('groupRows skips lines when MI Group value is EXPT', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'FEE1', 'Item Description':'Misc fee', 'Quantity Charged': 1, 'MI Group':'EXPT' }),
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'ABC', 'Item Description':'Actual item', 'Quantity Charged': 2 }),
  ];
  const g = groupRows(rows);
  expect(g.get('WO1').size).toBe(1);
  expect(g.get('WO1').has('ABC')).toBe(true);
});

test('rows without item code get unique per-line code to avoid lumping', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Item Description':'Pole', 'Quantity Charged': 3 }, 0),
    normalizeRow({ 'WORK ORDER':'WO1', 'Item Description':'Pole', 'Quantity Charged': 4 }, 1),
  ];
  const g = groupRows(rows);
  expect(g.get('WO1').size).toBe(2);
});

test('Quantity Charged is preferred per row and parses commas/parentheses', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'A', 'Item Description':'Item A', 'Quantity Charged':'1,234.5' }),
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'A', 'Item Description':'Item A', 'Quantity':'2' }), // falls back to Quantity (no Quantity Charged)
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'B', 'Item Description':'Item B', 'Quantity Charged':'(200)' }),
  ];
  const g = groupRows(rows);
  expect(g.get('WO1').get('A').posted).toBeCloseTo(1236.5);
  expect(g.get('WO1').get('B').returned).toBe(200);
});

test('zero-quantity lines are skipped', () => {
  const rows = [
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'A', 'Item Description':'Item A', 'Quantity Charged': 0 }),
    normalizeRow({ 'WORK ORDER':'WO1', 'Item':'B', 'Item Description':'Item B', 'Quantity Charged': 5 }),
  ];
  const g = groupRows(rows);
  expect(g.get('WO1').has('A')).toBe(false);
  expect(g.get('WO1').get('B').posted).toBe(5);
});
