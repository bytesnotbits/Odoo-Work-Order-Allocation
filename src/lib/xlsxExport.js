import * as XLSX from "xlsx";

export function exportAllocationsToXLSX({ workOrders, grouped, getItemState, keyOf, allocState }) {
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
          AssetId: meta.assetId || "",
          COE_LOC: meta.coeLoc || "",
          RACK_BAY: meta.rackBay || "",
          SEPCAT: meta.sepcat || "",
          // assets map can store a string or an object with meta
          ...(() => {
            const v = (allocState[k]?.assets || {})[a.id];
            if (typeof v === 'object') {
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

  const ws = XLSX.utils.json_to_sheet(out);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Allocations");
  XLSX.writeFile(wb, `allocations_${Date.now()}.xlsx`);
}