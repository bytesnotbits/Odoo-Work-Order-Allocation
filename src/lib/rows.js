// Excel row normalization + grouping helpers

export function normalizeRow(r, idx = 0) {
  const workOrder = String(r["WORK ORDER"] ?? r["Work Order"] ?? r["WorkOrder"] ?? "").trim();
  const orderRef = String(r["Order Reference"] ?? r["Order"] ?? r["SO"] ?? "").trim();
  const itemCode = String(r["Item"] ?? r["ITEM"] ?? "").trim();
  const itemDesc = String(r["Item Description"] ?? r["ITEM DESCRIPTION"] ?? "").trim();
  const workOrderDescription = String(
    r["Description"]
      ?? r["description"]
      ?? r["Work Order Description"]
      ?? r["WO Description"]
      ?? ""
  ).trim();
  const productLineRaw = r["Order Lines"] ?? r["Product"] ?? r["Item Description"] ?? r["Item"] ?? "";
  const productLine = String((itemCode || itemDesc)
    ? `${itemCode ? `[${itemCode}] ` : ""}${itemDesc || productLineRaw}`
    : productLineRaw || "").trim();

  const miGroup = String(r["MI Group"] ?? r["mi group"] ?? r["MI GROUP"] ?? r["group"] ?? r["Group"] ?? r["GROUP"] ?? "").trim();

  const qtyRaw = (
    r["Quantity Charged"]
    ?? r["Order Lines/Delivery Quantity"]
    ?? r["Delivered Qty"]
    ?? r["Quantity"]
    ?? r["Qty Charged"]
    ?? 0
  );
  const deliveryQty = parseNumber(qtyRaw);
  const cartQty = Number(r["Cart Quantity"] ?? r["Ordered Qty"] ?? 0) || 0;
  const status = String(r["Delivery Status"] ?? r["Status"] ?? "").trim();
  const creationDate = r["Creation Date"] ?? r["Date"] ?? null;
  const customer = String(r["Customer"] ?? "").trim();

  const { code: parsedCode, desc: parsedDesc } = parseProductFromLine(productLine, itemCode, itemDesc);
  const code = parsedCode || `LINE-${idx + 1}`;
  const desc = parsedDesc;

  return {
    workOrder,
    orderRef,
    productLine,
    itemCode,
    itemDesc,
    code,
    desc,
    deliveryQty,
    cartQty,
    status,
    creationDate,
    customer,
    group: miGroup,
    workOrderDescription,
  };
}

function parseNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const str = String(v).trim();
  if (!str) return 0;
  // handle "(1,234.5)" as -1234.5 and strip commas
  const isNeg = str.startsWith("(") && str.endsWith(")");
  const cleaned = str.replace(/[(),]/g, "").trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return isNeg ? -n : n;
}

export function parseProductFromLine(line, explicitCode = "", explicitDesc = "") {
  const raw = line || "";
  const m = raw.match(/\[(.*?)\]/);
  const code = (explicitCode || (m ? m[1] : "") || "").trim();
  const trimmed = raw.replace(/^.*?\]\s*/, "").trim();
  const desc = (explicitDesc || trimmed || raw || "").trim();
  return { code, desc };
}

export function isReturnRow(row) {
  return row.deliveryQty < 0 || /return/i.test(row.productLine) || /rma/i.test(row.productLine);
}

export function isCable(desc) {
  return /(fiber|cable|wire|coax|cat\s*\d)/i.test(desc || "");
}

export function groupRows(rows) {
  // Map<workOrder, Map<code, {code, desc, posted, returned, isCable, group}>>
  const m = new Map();
  for (const r of rows) {
    if (!r.workOrder) continue;
    if (r.deliveryQty === 0) continue;
    const { code, desc } = r.code && r.desc ? { code: r.code, desc: r.desc } : parseProductFromLine(r.productLine);
    if (!code && !desc) continue;

    // Skip MI Group exempt/tax lines
    const gLabel = (r.group || "").toLowerCase();
    const lineLabel = (r.productLine || r.desc || "").toLowerCase();
    const isExempt = gLabel.includes("expt") || gLabel.includes("exempt") || lineLabel.includes("expt - exempt");
    if (isExempt) continue;

    if (!m.has(r.workOrder)) m.set(r.workOrder, new Map());
    const gm = m.get(r.workOrder);
    if (!gm.has(code)) gm.set(code, { code, desc, posted: 0, returned: 0, isCable: isCable(desc), group: r.group || "" });
    const item = gm.get(code);
    if (isReturnRow(r)) item.returned += Math.abs(r.deliveryQty);
    else item.posted += r.deliveryQty;
    // prefer the first non-empty group we see for this item
    if (!item.group && r.group) item.group = r.group;
  }
  return m;
}
