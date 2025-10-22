// Excel row normalization + grouping helpers

export function normalizeRow(r) {
  return {
    workOrder: String(r["WORK ORDER"] ?? r["Work Order"] ?? r["WorkOrder"] ?? "").trim(),
    orderRef: String(r["Order Reference"] ?? r["Order"] ?? r["SO"] ?? "").trim(),
    productLine: String(r["Order Lines"] ?? r["Product"] ?? r["Item"] ?? "").trim(),
    deliveryQty: Number(r["Order Lines/Delivery Quantity"] ?? r["Delivered Qty"] ?? r["Quantity"] ?? 0) || 0,
    cartQty: Number(r["Cart Quantity"] ?? r["Ordered Qty"] ?? 0) || 0,
    status: String(r["Delivery Status"] ?? r["Status"] ?? "").trim(),
    creationDate: r["Creation Date"] ?? r["Date"] ?? null,
    customer: String(r["Customer"] ?? "").trim(),
  };
}

export function parseProductFromLine(line) {
  const m = (line || "").match(/\[(.*?)\]/);
  const code = m ? m[1] : "";
  const desc = (line || "").replace(/^.*?\]\s*/, "").trim();
  return { code, desc };
}

export function isReturnRow(row) {
  return row.deliveryQty < 0 || /return/i.test(row.productLine) || /rma/i.test(row.productLine);
}

export function isCable(desc) {
  return /(fiber|cable|wire|coax|cat\s*\d)/i.test(desc || "");
}

export function groupRows(rows) {
  // Map<workOrder, Map<code, {code, desc, posted, returned, isCable}>>
  const m = new Map();
  for (const r of rows) {
    if (!r.workOrder) continue;
    const { code, desc } = parseProductFromLine(r.productLine);
    if (!m.has(r.workOrder)) m.set(r.workOrder, new Map());
    const gm = m.get(r.workOrder);
    if (!gm.has(code)) gm.set(code, { code, desc, posted: 0, returned: 0, isCable: isCable(desc) });
    const item = gm.get(code);
    if (isReturnRow(r)) item.returned += Math.abs(r.deliveryQty);
    else item.posted += r.deliveryQty;
  }
  return m;
}