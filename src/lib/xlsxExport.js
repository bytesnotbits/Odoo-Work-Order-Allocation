const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function buildAllocationRows({ workOrders, grouped, getItemState, keyOf, allocState }) {
  const out = [];
  for (const wo of workOrders) {
    const gm = grouped.get(wo);
    if (!gm) continue;
    for (const [code, base] of gm) {
      const k = keyOf(wo, code);
      const s = getItemState(wo, code);
      for (const a of s.extra.allocations) {
        out.push({
          WorkOrder: wo,
          ProductCode: code,
          Description: base.desc,
          Type: a.type,
          QuantityOrFootage: a.type === "reel" ? a.footage : a.qty,
          AllocationId: a.allocationId,
          AllocationCategory: a.allocationCategory || "",
          ReelSerialNumber: a.reelSerial || "",
          OuterSeq: a.type === "reel" ? a.outer : "",
          InnerSeq: a.type === "reel" ? a.inner : "",
          // assets map can store a string or an object with meta
          ...(() => {
            const v = (allocState[k]?.assets || {})[a.id];
            if (typeof v === "object") {
              return {
                AssetId: v.assetId || "",
                COE_LOC: v.coeLoc || "",
                RACK_BAY: v.rackBay || "",
                SEPCAT: v.sepcat || "",
              };
            }
            return { AssetId: v || "", COE_LOC: "", RACK_BAY: "", SEPCAT: "" };
          })(),
          // reel span gets appended below
        });
      }
    }
  }
  // Add reel span cols
  for (const row of out) {
    const k = `${row.WorkOrder}|${row.ProductCode}`;
    const rec = allocState[k] || {};
    const rs = row.ReelSerialNumber ? (rec.reels || {})[row.ReelSerialNumber] : null;
    row.ReelSpanStart = rs ? rs.start : "";
    row.ReelSpanEnd = rs ? rs.end : "";
  }
  return out;
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: MIME_XLSX });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

import ExcelJS from "exceljs/dist/exceljs.min.js";

function createRealWorkbook() {
  return Promise.resolve(new ExcelJS.Workbook());
}

export async function exportAllocationsToXLSX(
  { workOrders, grouped, getItemState, keyOf, allocState },
  {
    createWorkbook = createRealWorkbook,
    download = downloadWorkbook,
    filename = `allocations_${Date.now()}.xlsx`,
  } = {},
) {
  const rows = buildAllocationRows({ workOrders, grouped, getItemState, keyOf, allocState });
  const wb = await createWorkbook();
  const ws = wb.addWorksheet("Allocations");

  if (rows.length > 0) {
    ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    rows.forEach((row) => ws.addRow(row));
  }

  await download(wb, filename);
  return rows;
}
