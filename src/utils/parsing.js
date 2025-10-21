export function normalizeRow(r) {
  return {
    workOrder: String(r["WORK ORDER"] ?? r["Work Order"] ?? r["WorkOrder"] ?? "").trim(),
    orderRef: String(r["Order Reference"] ?? r["Order"] ?? r["SO"] ?? "").trim(),
    productLine: String(r["Order Lines"] ?? r["Product"] ?? r["Item"] ?? "").trim(),
    deliveryQty:
      Number(r["Order Lines/Delivery Quantity"] ?? r["Delivered Qty"] ?? r["Quantity"] ?? 0) || 0,
    cartQty: Number(r["Cart Quantity"] ?? r["Ordered Qty"] ?? 0) || 0,
    status: String(r["Delivery Status"] ?? r["Status"] ?? "").trim(),
    creationDate: r["Creation Date"] ?? r["Date"] ?? null,
    customer: String(r["Customer"] ?? "").trim(),
  };
}

export function parseProductFromLine(line) {
  const codeMatch = (line || "").match(/\[(.*?)\]/);
  const code = codeMatch ? codeMatch[1] : "";
  const desc = (line || "").replace(/^.*?\]\s*/, "").trim();
  return { code, desc };
}

export function isReturnRow(row) {
  return row.deliveryQty < 0 || /return/i.test(row.productLine) || /rma/i.test(row.productLine);
}

export function isCable(desc) {
  return /(fiber|cable|wire|coax|cat\s*\d)/i.test(desc || "");
}