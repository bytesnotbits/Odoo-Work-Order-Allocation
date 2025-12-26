import ExcelJS from 'exceljs/dist/exceljs.min.js';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function loadWorkbook(file) {
  const workbook = new ExcelJS.Workbook();

  const name = file.name?.toLowerCase() || '';
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    // ExcelJS wants a stream for CSV; parse manually for reliability in the browser.
    const text = await file.text();
    return textToWorkbook(text);
  }

  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function textToWorkbook(text) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  const rows = parseCsv(text);
  rows.forEach((r) => sheet.addRow(r));
  return workbook;
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  const flushField = () => {
    current.push(field);
    field = '';
  };

  const flushRow = () => {
    rows.push(current);
    current = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        flushField();
      } else if (ch === '\n') {
        flushField();
        flushRow();
      } else if (ch === '\r') {
        // ignore
      } else {
        field += ch;
      }
    }
  }
  // flush remaining
  flushField();
  if (current.length > 1 || current[0] !== '') flushRow();
  return rows;
}

function sheetToJson(sheet) {
  if (!sheet) return [];
  const headers = sheet.getRow(1).values.slice(1).map((h) => (h ?? '').toString());
  const rows = [];
  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const row = sheet.getRow(i);
    const values = row.values;
    const entry = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const val = values[idx + 1];
      entry[header] = val ?? null;
    });
    // Include rows even if empty to mirror previous behavior with defval: null
    if (Object.keys(entry).length > 0) rows.push(entry);
  }
  return rows;
}

export async function readFirstSheet(file) {
  const workbook = await loadWorkbook(file);
  const sheet = workbook.worksheets[0];
  return sheetToJson(sheet);
}

export async function exportAllocationsToXLSX(rows, filename = `allocations_${Date.now()}.xlsx`) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Allocations');

  if (rows.length > 0) {
    sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    rows.forEach((row) => sheet.addRow(row));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: MIME_XLSX });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
