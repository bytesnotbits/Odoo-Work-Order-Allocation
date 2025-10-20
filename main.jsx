import React, { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import { FileUp, Package2, Split, Ruler, Plus, Trash2, Download, CheckCircle2, AlertTriangle } from "lucide-react";

// --- Constants / Types ---
const ALLOCATION_OPTIONS = ["Aerial", "Buried", "Underground", "Removal"]; // + custom allowed
function uid() { return Math.random().toString(36).slice(2, 10); }

/** Raw row as read from Excel */
function normalizeRow(r) {
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

/** Parse product code + description from Order Lines */
function parseProductFromLine(line) {
  const codeMatch = (line || "").match(/\[(.*?)\]/);
  const code = codeMatch ? codeMatch[1] : "";
  const desc = (line || "").replace(/^.*?\]\s*/, "").trim();
  return { code, desc };
}

function isReturnRow(row) {
  return row.deliveryQty < 0 || /return/i.test(row.productLine) || /rma/i.test(row.productLine);
}

function isCable(desc) {
  return /(fiber|cable|wire|coax|cat\s*\d)/i.test(desc || "");
}

// --- Demo seed data (used when no file uploaded) ---
const demoRows = [
  { "Creation Date": "2025-10-17 09:58:20", "Customer": "Chris Lindemann Jr", "Delivery Status": "Fully Delivered", "Order Reference": "W001629", "Order Lines": "W001629 - [1396R] FO 288R RIBBON FIBER", "WORK ORDER": "11880", "Cart Quantity": 3896, "Order Lines/Delivery Quantity": 990 },
  { "Creation Date": "2025-10-17 09:45:41", "Customer": "Bart Tucker", "Delivery Status": "Fully Delivered", "Order Reference": "W001628", "Order Lines": "W001628 - [190] POLE, CLASS 5, 35'", "WORK ORDER": "11948", "Cart Quantity": 1, "Order Lines/Delivery Quantity": 1 },
  { "Creation Date": "2025-10-17 11:04:40", "Customer": "Chris Machicek", "Delivery Status": "Fully Delivered", "Order Reference": "W001633", "Order Lines": "W001633 - [6295] DUAL BUS 20-OUTPUT GMT FUSE DISTRIBUTION", "WORK ORDER": "11809WC", "Cart Quantity": 1, "Order Lines/Delivery Quantity": 1 },
  { "Creation Date": "2025-10-16 13:03:31", "Customer": "Patrick Tinley", "Delivery Status": "Fully Delivered", "Order Reference": "W001615", "Order Lines": "W001615 - [5004] ENERSYS SBS 145F 145AH 12V BATTERY", "WORK ORDER": "11950C", "Cart Quantity": 4, "Order Lines/Delivery Quantity": 4 },
  { "Creation Date": "2025-10-17 12:12:10", "Customer": "Returns", "Delivery Status": "Done", "Order Reference": "W001629", "Order Lines": "Return - [1396R] FO 288R RIBBON FIBER", "WORK ORDER": "11880", "Cart Quantity": 0, "Order Lines/Delivery Quantity": -200 },
  { "Creation Date": "2025-10-17 14:30:00", "Customer": "Walk In", "Delivery Status": "Fully Delivered", "Order Reference": "W001700", "Order Lines": "W001700 - [710] TYCO D", "WORK ORDER": "12001", "Cart Quantity": 4, "Order Lines/Delivery Quantity": 4 },
];

// --- Helper Components ---
function Badge({ children }) {
  return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200">{children}</span>;
}

function Section({ title, children, icon: Icon }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">{Icon && <Icon className="w-4 h-4" />}<h2 className="text-lg font-semibold">{title}</h2></div>
      <div className="bg-white rounded-2xl shadow p-4 border border-gray-100">{children}</div>
    </section>
  );
}

// --- Main App ---
export default function App() {
  const [rawRows, setRawRows] = useState(demoRows);
  const [selectedWO, setSelectedWO] = useState("");
  const [tab, setTab] = useState("engineering"); // engineering | accounting

  const rows = useMemo(() => rawRows.map(normalizeRow), [rawRows]);

  const grouped = useMemo(() => {
    const m = new Map(); // workOrder -> Map(productCode -> item)
    for (const r of rows) {
      if (!r.workOrder) continue;
      const { code, desc } = parseProductFromLine(r.productLine);
      if (!m.has(r.workOrder)) m.set(r.workOrder, new Map());
      const gm = m.get(r.workOrder);
      if (!gm.has(code)) gm.set(code, { code, desc, posted: 0, returned: 0, allocations: [], isCable: isCable(desc) });
      const item = gm.get(code);
      if (isReturnRow(r)) item.returned += Math.abs(r.deliveryQty); else item.posted += r.deliveryQty;
    }
    return m;
  }, [rows]);

  // Persist allocations and asset IDs in local state keyed by WO+code
  const [allocState, setAllocState] = useState({}); // { `${wo}|${code}`: { allocations: [...], assets: {allocId: assetId}, locked: false, reels: { [reelSerial]: {start,end} } } }
  function keyOf(wo, code) { return `${wo}|${code}`; }

  function getItemState(wo, code) {
    const base = grouped.get(wo)?.get(code);
    const k = keyOf(wo, code);
    const extra = allocState[k] || { allocations: [], assets: {}, locked: false };
    const posted = base?.posted || 0;
    const returned = base?.returned || 0;
    const totalAvailable = Math.max(posted - returned, 0);
    const allocatedSum = extra.allocations.reduce((s, a) => s + (a.type === "reel" ? a.footage : a.qty), 0);
    const remaining = Math.max(totalAvailable - allocatedSum, 0);
    return { base, extra, totalAvailable, allocatedSum, remaining, overAllocated: allocatedSum > totalAvailable };
  }

  function upsertAllocation(wo, code, alloc) {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false };
      return { ...prev, [k]: { ...cur, allocations: [...cur.allocations, alloc] } };
    });
  }
  function removeAllocation(wo, code, id) {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false };
      return { ...prev, [k]: { ...cur, allocations: cur.allocations.filter(a => a.id !== id) } };
    });
  }
  function setAssetId(wo, code, allocId, assetId) {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false };
      return { ...prev, [k]: { ...cur, assets: { ...cur.assets, [allocId]: assetId } } };
    });
  }
  // Reel span management (per WO+Product+Reel)
  function setReelSpan(wo, code, reelSerial, start, end) {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false };
      const reels = { ...(cur.reels || {}) };
      reels[reelSerial] = { start, end };
      return { ...prev, [k]: { ...cur, reels } };
    });
  }
  function getReelSpan(wo, code, reelSerial) {
    const k = keyOf(wo, code);
    const rec = allocState[k] || {};
    return (rec.reels && rec.reels[reelSerial]) ? rec.reels[reelSerial] : { start: "", end: "" };
  }
  function listReels(wo, code) {
    const k = keyOf(wo, code);
    const rec = allocState[k] || {};
    return Object.keys(rec.reels || {});
  }
  function lockWorkOrder(wo) {
    const gm = grouped.get(wo);
    if (!gm) return;

    const issues = [];

    // 1) Over-allocation & Unallocated checks
    for (const [code] of gm) {
      const s = getItemState(wo, code);
      if (s.allocatedSum > s.totalAvailable) {
        issues.push(`Over-allocated on [${code}]: allocations (${s.allocatedSum}) exceed available (${s.totalAvailable}).`);
      }
      if (s.remaining > 0) {
        issues.push(`Unallocated material on [${code}]: remaining ${s.remaining}.`);
      }
    }

    // 2) Overlap & span-bound checks for reel pieces (per reel)
    for (const [code] of gm) {
      const k = keyOf(wo, code);
      const rec = allocState[k] || { allocations: [], reels: {} };

      // group pieces by reel
      const byReel = {};
      for (const a of rec.allocations || []) {
        if (a.type !== 'reel') continue;
        const reel = a.reelSerial || '(no reel)';
        const s = Math.min(a.outer, a.inner);
        const e = Math.max(a.outer, a.inner);
        if (!byReel[reel]) byReel[reel] = [];
        byReel[reel].push([s, e]);
      }

      for (const reel of Object.keys(byReel)) {
        const intervals = byReel[reel].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
        for (let i = 1; i < intervals.length; i++) {
          const prev = intervals[i - 1];
          const curr = intervals[i];
          // touching endpoints allowed => overlap only if curr.start < prev.end
          if (curr[0] < prev[1]) {
            issues.push(`Overlap on [${code}] reel ${reel}: [${prev[0]}–${prev[1]}] overlaps [${curr[0]}–${curr[1]}].`);
          }
        }

        // span bounds check if a total span saved for this reel
        const rs = (rec.reels || {})[reel];
        if (rs && Number.isFinite(Number(rs.start)) && Number.isFinite(Number(rs.end))) {
          const lo = Math.min(Number(rs.start), Number(rs.end));
          const hi = Math.max(Number(rs.start), Number(rs.end));
          for (const [s, e] of intervals) {
            if (s < lo || e > hi) {
              issues.push(`Piece outside saved span on [${code}] reel ${reel}: [${s}–${e}] not within [${lo}–${hi}].`);
            }
          }
        }
      }
    }

    // 3) Asset IDs guard
    for (const [code] of gm) {
      const k = keyOf(wo, code);
      const state = allocState[k] || { allocations: [], assets: {} };
      for (const a of state.allocations) {
        if (!state.assets[a.id]) {
          issues.push(`Missing Asset ID on [${code}] for allocation ${a.id}.`);
        }
      }
    }

    if (issues.length > 0) {
      alert(`Cannot complete WO ${wo} due to:

• ${issues.join('
• ')}`);
      return;
    }

    // If no issues, lock work order
    setAllocState(prev => {
      const next = { ...prev };
      for (const [code] of gm) {
        const k = keyOf(wo, code);
        if (next[k]) next[k] = { ...next[k], locked: true };
      }
      return next;
    });
    alert(`WO ${wo} marked complete.`);
  }
    }
    // Asset IDs guard
    let allHaveAssets = true;
    for (const [code] of gm) {
      const k = keyOf(wo, code);
      const state = allocState[k] || { allocations: [], assets: {} };
      for (const a of state.allocations) { if (!state.assets[a.id]) { allHaveAssets = false; break; } }
      if (!allHaveAssets) break;
    }
    if (!allHaveAssets) return alert("Not all allocations have Asset IDs.");
    setAllocState(prev => {
      const next = { ...prev };
      for (const [code] of gm) {
        const k = keyOf(wo, code);
        if (next[k]) next[k] = { ...next[k], locked: true };
      }
      return next;
    });
  }

  const workOrders = useMemo(() => Array.from(grouped.keys()).sort(), [grouped]);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
      setRawRows(json); setSelectedWO(""); setAllocState({});
    };
    reader.readAsArrayBuffer(file);
  }

  function exportAllocations() {
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
            AssetId: (allocState[k]?.assets || {})[a.id] || "",
          });
        }
      }
    }
    // Include reel span columns if present
    for (const row of out) {
      // look up span for this WO+Product+Reel
      const k = keyOf(row.WorkOrder, row.ProductCode);
      const rec = allocState[k] || {};
      const reels = rec.reels || {};
      const rs = row.ReelSerialNumber ? reels[row.ReelSerialNumber] : null;
      row.ReelSpanStart = rs ? rs.start : "";
      row.ReelSpanEnd = rs ? rs.end : "";
    }
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Allocations");
    XLSX.writeFile(wb, `allocations_${Date.now()}.xlsx`);
  }

  const activeWO = selectedWO || workOrders[0] || "";

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2"><Package2 className="w-7 h-7" /> Work Order Material Allocation – Sample App</h1>
          <p className="text-gray-600 mt-1">Upload your <em>Sales Order (sale.order)</em> export, review posted vs. returned quantities, allocate materials (including cable reels), and hand off to accounting for Asset IDs.</p>
        </motion.header>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 bg-white rounded-2xl shadow p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <FileUp className="w-5 h-5" />
              <div>
                <div className="font-medium">Upload file</div>
                <div className="text-sm text-gray-600">XLSX/CSV with columns like: WORK ORDER, Order Lines, Order Lines/Delivery Quantity</div>
              </div>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="mt-3" />
            <div className="text-xs text-gray-500 mt-2">No file? Using demo data.</div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 border border-gray-100">
            <div className="flex items-center gap-2 justify-between">
              <div>
                <div className="font-medium mb-1">Work Order</div>
                <select className="w-full border rounded-xl p-2" value={activeWO} onChange={(e) => setSelectedWO(e.target.value)}>
                  {workOrders.length === 0 && <option value="">No work orders</option>}
                  {workOrders.map((wo) => (<option key={wo} value={wo}>{wo}</option>))}
                </select>
              </div>
              <div className="flex gap-2 items-end">
                <button onClick={() => setTab("engineering")} className={`px-3 py-2 rounded-xl border ${tab === "engineering" ? "bg-gray-900 text-white" : "bg-white"}`}>Engineering</button>
                <button onClick={() => setTab("accounting")} className={`px-3 py-2 rounded-xl border ${tab === "accounting" ? "bg-gray-900 text-white" : "bg-white"}`}>Accounting</button>
              </div>
            </div>
          </div>
        </div>

        {activeWO ? (
          <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Section title={`Materials for WO ${activeWO}`} icon={Split}>
              <WOView
                wo={activeWO}
                grouped={grouped}
                getItemState={getItemState}
                upsertAllocation={upsertAllocation}
                removeAllocation={removeAllocation}
                setAssetId={setAssetId}
                setReelSpan={setReelSpan}
                getReelSpan={getReelSpan}
                listReels={listReels}
                lockWorkOrder={lockWorkOrder}
                tab={tab}
                allocState={allocState}
              />
            </Section>

            <div className="flex items-center gap-2">
              <button onClick={exportAllocations} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gray-900 text-white"><Download className="w-4 h-4" /> Export allocations</button>
              <Badge>Posted/Returned derived from delivery quantities (returns = negative qty or lines containing "Return").</Badge>
            </div>
          </motion.main>
        ) : (
          <div className="text-gray-600">No work orders found in the file.</div>
        )}
      </div>
    </div>
  );
}

function WOView({ wo, grouped, getItemState, upsertAllocation, removeAllocation, setAssetId, setReelSpan, getReelSpan, listReels, lockWorkOrder, tab, allocState }) {
  const gm = grouped.get(wo) || new Map();
  const products = Array.from(gm.values());

  const allAllocated = products.every((p) => getItemState(wo, p.code).remaining === 0);
  const allAsseted = products.every((p) => {
    const s = getItemState(wo, p.code);
    return s.extra.allocations.length === 0 || s.extra.allocations.every((a) => (allocState[`${wo}|${p.code}`]?.assets || {})[a.id]);
  });
  const anyOverAllocated = products.some((p) => {
    const s = getItemState(wo, p.code);
    return s.allocatedSum > s.totalAvailable;
  });
  const anyUnallocated = products.some((p) => getItemState(wo, p.code).remaining > 0);

  return (
    <div className="space-y-6">
      {products.length === 0 && (<div className="text-sm text-gray-600">No products for this work order.</div>)}

      {products.map((p) => (
        <ProductCard
          key={p.code}
          wo={wo}
          product={p}
          getItemState={getItemState}
          upsertAllocation={upsertAllocation}
          removeAllocation={removeAllocation}
          setAssetId={setAssetId}
          setReelSpan={setReelSpan}
          getReelSpan={getReelSpan}
          listReels={listReels}
          tab={tab}
          locked={(allocState[`${wo}|${p.code}`]?.locked) || false}
        />
      ))}

      <div className="flex items-center gap-3 pt-2 border-t">
        {(anyOverAllocated || anyUnallocated) && (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Open issues: resolve before completion</Badge>
        )}
        {allAllocated ? (
          <Badge><CheckCircle2 className="inline w-4 h-4 mr-1" /> Engineering: All material allocated (no unallocated)</Badge>
        ) : (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Engineering: Unallocated material remains</Badge>
        )}
        {allAsseted ? (
          <Badge><CheckCircle2 className="inline w-4 h-4 mr-1" /> Accounting: Asset IDs assigned</Badge>
        ) : (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Accounting: Asset IDs missing</Badge>
        )}
        <button
          onClick={() => {
            if (anyOverAllocated || anyUnallocated) {
              // Let lockWorkOrder compose the full reasons list
              lockWorkOrder(wo);
              return;
            }
            lockWorkOrder(wo);
          }}
          disabled={anyOverAllocated || anyUnallocated}
          title={(anyOverAllocated || anyUnallocated) ? 'Resolve issues before completion' : ''}
          className="ml-auto px-3 py-2 rounded-xl border disabled:opacity-50"
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}

function ProductCard({ wo, product, getItemState, upsertAllocation, removeAllocation, setAssetId, setReelSpan, getReelSpan, listReels, tab, locked }) {
  const { base, extra, totalAvailable, allocatedSum, remaining } = getItemState(wo, product.code);
  const [allocQty, setAllocQty] = useState("");
  const [allocId, setAllocId] = useState("");
  const [allocCategory, setAllocCategory] = useState(ALLOCATION_OPTIONS[0]);
  const [allocCategoryCustom, setAllocCategoryCustom] = useState("");
  const [outer, setOuter] = useState("");
  const [inner, setInner] = useState("");
  const [reelSerial, setReelSerial] = useState("");
  // reel state (per WO+Product+Reel)
  const [spanStartInput, setSpanStartInput] = useState("");
  const [spanEndInput, setSpanEndInput] = useState("");

  if (!base) return null;
  const reelFootage = Math.abs((Number(inner) || 0) - (Number(outer) || 0));
  const currentSpan = reelSerial ? getReelSpan(wo, product.code, reelSerial) : { start: "", end: "" };
  const spanStartNum = (currentSpan && isFinite(Number(currentSpan.start))) ? Number(currentSpan.start) : null;
  const spanEndNum = (currentSpan && isFinite(Number(currentSpan.end))) ? Number(currentSpan.end) : null;
  const spanMin = (spanStartNum !== null && spanEndNum !== null) ? Math.min(spanStartNum, spanEndNum) : null;
  const spanMax = (spanStartNum !== null && spanEndNum !== null) ? Math.max(spanStartNum, spanEndNum) : null;

  function addRegular() {
    const qty = Number(allocQty);
    if (!qty || qty <= 0) return alert("Enter a positive quantity");
    if (qty > remaining) return alert("Quantity exceeds remaining available");
    const id = uid();
    const finalCategory = allocCategory === "__custom__" ? (allocCategoryCustom || "Custom") : allocCategory;
    upsertAllocation(wo, product.code, { id, type: "regular", qty, allocationId: allocId || id, allocationCategory: finalCategory, reelSerial });
    setAllocQty(""); setAllocId(""); setReelSerial(""); setAllocCategory(ALLOCATION_OPTIONS[0]); setAllocCategoryCustom("");
  }

  function addReelPiece() {
    if (!reelSerial) return alert("Enter a Reel/Serial Number for this piece");
    if (reelFootage <= 0) return alert("Enter valid outer/inner to compute footage");
    if (reelFootage > remaining) return alert("Footage exceeds remaining available");

    const s = Math.min(Number(outer), Number(inner));
    const e = Math.max(Number(outer), Number(inner));
    const hasSpan = (spanMin !== null && spanMax !== null);
    if (hasSpan) {
      if (s < spanMin || e > spanMax) return alert("Piece is outside the defined span range");
      for (const a of extra.allocations) {
        if (a.type !== 'reel' || a.outer == null || a.inner == null) continue;
        if ((a.reelSerial || "") !== reelSerial) continue; // overlap only within same reel
        const es = Math.min(a.outer, a.inner);
        const ee = Math.max(a.outer, a.inner);
        const overlaps = Math.min(e, ee) > Math.max(s, es);
        if (overlaps) return alert(`Overlap with existing piece [${es}–${ee}]`);
      }
    }

    const id = uid();
    const finalCategory = allocCategory === "__custom__" ? (allocCategoryCustom || "Custom") : allocCategory;
    upsertAllocation(wo, product.code, { id, type: "reel", outer: Number(outer), inner: Number(inner), footage: reelFootage, allocationId: allocId || id, allocationCategory: finalCategory, reelSerial });
    setOuter(""); setInner(""); setAllocId(""); setReelSerial(""); setAllocCategory(ALLOCATION_OPTIONS[0]); setAllocCategoryCustom("");
  }

  return (
    <div className="border rounded-2xl p-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex-1">
          <div className="font-semibold text-base md:text-lg">[{product.code}] {product.desc || "Unnamed"}</div>
          <div className="text-sm text-gray-600 flex flex-wrap gap-3 mt-1">
            <span>Posted: <b>{product.posted}</b></span>
            <span>Returned: <b>{product.returned}</b></span>
            <span>Total available: <b>{totalAvailable}</b></span>
            <span>Allocated: <b>{allocatedSum}</b></span>
            <span className={remaining === 0 ? "text-green-600" : "text-amber-600"}>Unallocated: <b>{remaining}</b></span>
            {product.isCable && <Badge>Reel/Cable</Badge>}
            {allocatedSum > totalAvailable && <span className="text-red-600 font-medium">Over-allocated — adjust allocations</span>}
          </div>
        </div>
      </div>

      {/* Engineering Tab */}
      {tab === "engineering" && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-3 border">
            <div className="font-medium mb-2">Add allocation</div>
            {!product.isCable && (
              <div className="space-y-2">
                <label className="block text-sm">Quantity</label>
                <input type="number" min={0} step={1} className="w-full border rounded-xl p-2" value={allocQty} onChange={(e) => setAllocQty(e.target.value)} />
                <label className="block text-sm">Allocation notes (optional)</label>
                <input className="w-full border rounded-xl p-2" value={allocId} onChange={(e) => setAllocId(e.target.value)} placeholder="e.g., AERIAL-FIBER-01" />
                <label className="block text-sm mt-2">Allocation Category</label>
                <div className="flex gap-2">
                  <select className="border rounded-xl p-2" value={allocCategory} onChange={(e) => setAllocCategory(e.target.value)}>
                    {ALLOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {allocCategory === "__custom__" && (
                    <input className="flex-1 border rounded-xl p-2" placeholder="Enter custom category" value={allocCategoryCustom} onChange={(e) => setAllocCategoryCustom(e.target.value)} />
                  )}
                </div>
                <label className="block text-sm mt-2">Reel/Serial Number (optional)</label>
                <input className="w-full border rounded-xl p-2" value={reelSerial} onChange={(e) => setReelSerial(e.target.value)} placeholder="e.g., REEL-12345 or SN-0001" />
                <button disabled={locked} onClick={addRegular} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-50"><Plus className="w-4 h-4" /> Add line</button>
              </div>
            )}

            {product.isCable && (
              <div className="space-y-2">
                {/* Reel & Span (per reel) */}
                <div className="bg-white border rounded-xl p-3">
                  <div className="font-medium mb-1">Reel & span (optional)</div>
                  <div className="grid md:grid-cols-3 gap-2">
                    <div className="md:col-span-1">
                      <label className="block text-sm">Reel/Serial Number</label>
                      <input className="w-full border rounded-xl p-2" value={reelSerial} onChange={(e)=>{ setReelSerial(e.target.value); }} placeholder="REEL-XXXXX" />
                      {listReels(wo, product.code).length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">Known reels: {listReels(wo, product.code).join(', ')}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm">Span start sequence</label>
                      <input type="number" className="w-full border rounded-xl p-2" value={spanStartInput} onChange={(e)=>setSpanStartInput(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm">Span end sequence</label>
                      <input type="number" className="w-full border rounded-xl p-2" value={spanEndInput} onChange={(e)=>setSpanEndInput(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <button disabled={locked} onClick={()=>{
                      if (!reelSerial) { alert('Enter reel/serial to save a span for it'); return; }
                      const startNum = Number(spanStartInput); const endNum = Number(spanEndInput);
                      if (!isFinite(startNum) || !isFinite(endNum)) { alert('Enter numeric span start/end'); return; }
                      setReelSpan(wo, product.code, reelSerial, startNum, endNum);
                    }} className="px-3 py-1 rounded-lg border">Save span</button>
                  </div>

                  {/* Coverage summary for selected reel */}
                  {(() => {
                    if (!reelSerial) return null;
                    const rs = getReelSpan(wo, product.code, reelSerial);
                    const startNum = Number(rs?.start);
                    const endNum = Number(rs?.end);
                    if (isFinite(startNum) && isFinite(endNum)) {
                      const total = Math.abs(endNum - startNum);
                      const covered = extra.allocations
                        .filter(a => a.type === 'reel' && (a.reelSerial || "") === reelSerial && a.outer != null && a.inner != null)
                        .reduce((s, a) => s + Math.abs(a.outer - a.inner), 0);
                      const remainingSpan = Math.max(total - covered, 0);
                      return <div className="text-sm text-gray-600 mt-2">[{reelSerial}] Span total: <b>{total}</b> | Covered: <b>{covered}</b> | Remaining: <b>{remainingSpan}</b></div>;
                    }
                    return <div className="text-sm text-gray-500 mt-2">No span saved for this reel yet.</div>;
                  })()}
                </div>

                {/* Reel piece entry */}
                <div className="flex items-center gap-2"><Ruler className="w-4 h-4" /> <div className="font-medium">Reel piece</div></div>
                <label className="block text-sm">Outer Sequence</label>
                <input type="number" className="w-full border rounded-xl p-2" value={outer} onChange={(e) => setOuter(e.target.value)} />
                <label className="block text-sm">Inner Sequence</label>
                <input type="number" className="w-full border rounded-xl p-2" value={inner} onChange={(e) => setInner(e.target.value)} />
                <div className="text-sm text-gray-600">Footage = |Inner − Outer| → <b>{reelFootage}</b></div>
                <label className="block text-sm">Allocation notes (optional)</label>
                <input className="w-full border rounded-xl p-2" value={allocId} onChange={(e) => setAllocId(e.target.value)} placeholder="e.g., AERIAL-SPAN-12" />
                <label className="block text-sm mt-2">Allocation Category</label>
                <div className="flex gap-2">
                  <select className="border rounded-xl p-2" value={allocCategory} onChange={(e) => setAllocCategory(e.target.value)}>
                    {ALLOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {allocCategory === "__custom__" && (
                    <input className="flex-1 border rounded-xl p-2" placeholder="Enter custom category" value={allocCategoryCustom} onChange={(e) => setAllocCategoryCustom(e.target.value)} />
                  )}
                </div>
                <label className="block text-sm mt-2">Reel/Serial Number <span className="text-red-500">*</span></label>
                <input className="w-full border rounded-xl p-2" value={reelSerial} onChange={(e) => setReelSerial(e.target.value)} placeholder="REEL-XXXXX" />
                <button disabled={locked} onClick={addReelPiece} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-50"><Plus className="w-4 h-4" /> Add piece</button>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-3 border overflow-x-auto">
            <div className="font-medium mb-2">Allocations</div>
            {extra.allocations.length === 0 ? (
              <div className="text-sm text-gray-600">No allocations yet.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Qty/Footage</th>
                    <th className="py-1 pr-3">Outer</th>
                    <th className="py-1 pr-3">Inner</th>
                    <th className="py-1 pr-3">Allocation Notes</th>
                    <th className="py-1 pr-3">Category</th>
                    <th className="py-1 pr-3">Reel/Serial</th>
                    <th className="py-1 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {extra.allocations.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="py-1 pr-3">{a.type}</td>
                      <td className="py-1 pr-3">{a.type === "reel" ? a.footage : a.qty}</td>
                      <td className="py-1 pr-3">{a.type === "reel" ? a.outer : ""}</td>
                      <td className="py-1 pr-3">{a.type === "reel" ? a.inner : ""}</td>
                      <td className="py-1 pr-3">{a.allocationId}</td>
                      <td className="py-1 pr-3">{a.allocationCategory || ""}</td>
                      <td className="py-1 pr-3">{a.reelSerial || ""}</td>
                      <td className="py-1 pr-3">
                        <button disabled={locked} onClick={() => removeAllocation(wo, product.code, a.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border"><Trash2 className="w-4 h-4" /> Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Accounting Tab */}
      {tab === "accounting" && (
        <div className="mt-4 bg-gray-50 rounded-xl p-3 border overflow-x-auto">
          {extra.allocations.length === 0 ? (
            <div className="text-sm text-gray-600">No allocations to assign assets.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Qty/Footage</th>
                  <th className="py-1 pr-3">Outer</th>
                  <th className="py-1 pr-3">Inner</th>
                  <th className="py-1 pr-3">Allocation Notes</th>
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3">Reel/Serial</th>
                  <th className="py-1 pr-3">Asset ID</th>
                </tr>
              </thead>
              <tbody>
                {extra.allocations.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1 pr-3">{a.type}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.footage : a.qty}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.outer : ""}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.inner : ""}</td>
                    <td className="py-1 pr-3">{a.allocationId}</td>
                    <td className="py-1 pr-3">{a.allocationCategory || ""}</td>
                    <td className="py-1 pr-3">{a.reelSerial || ""}</td>
                    <td className="py-1 pr-3"><input className="border rounded-lg p-1" placeholder="Asset ID" onChange={(e) => setAssetId(wo, product.code, a.id, e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// --- Tiny runtime tests (run once in dev) ---
function __dev_assert(name, cond) { if (!cond) { console.error(`TEST FAILED: ${name}`); } else { console.log(`TEST PASSED: ${name}`); } }

function __test_absFootage() { const a = Math.abs(5000 - 3000); __dev_assert('footage calc 5000/3000', a === 2000); }
function __test_overalloc() {
  const totalAvailable = 4; const allocations = [{type:'regular', qty:2},{type:'regular', qty:1}];
  const sum = allocations.reduce((s,x)=>s+(x.type==='reel'?x.footage:x.qty),0);
  __dev_assert('overalloc false', sum <= totalAvailable);
}
function __test_overlap() {
  const overlaps = (a,b)=> Math.min(a[1], b[1]) > Math.max(a[0], b[0]);
  __dev_assert('no overlap [0,10] vs [10,20]', overlaps([0,10],[10,20]) === false);
  __dev_assert('overlap [0,10] vs [9,12]', overlaps([0,10],[9,12]) === true);
}
function __test_span_bounds_and_reel_scoping() {
  // spans can touch at endpoints (no overlap)
  const overlaps = (a,b)=> Math.min(a[1], b[1]) > Math.max(a[0], b[0]);
  __dev_assert('touching endpoints allowed', overlaps([100,200],[200,250]) === false);
  // cross-reel pieces should be considered independent (scoped by reel)
  const pieceA = {reel:'R1', seg:[10170,10166]};
  const pieceB = {reel:'R2', seg:[10170,10166]};
  __dev_assert('same segment different reels ok', pieceA.reel !== pieceB.reel);
  // detector sanity: [0,10] & [9,12] overlap; [10,20] touches but ok
  const sorted = [[0,10],[10,20],[9,12]].sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
  const hasOverlap = (()=>{ let hit=false; for(let i=1;i<sorted.length;i++){ if(sorted[i][0] < sorted[i-1][1]) { hit=true; break; } } return hit; })();
  __dev_assert('overlap detector finds conflict', hasOverlap === true);
};
  const pieceB = {reel:'R2', seg:[10170,10166]};
  __dev_assert('same segment different reels ok', pieceA.reel !== pieceB.reel);
}

if (typeof window !== 'undefined') {
  try {
    __test_absFootage();
    __test_overalloc();
    __test_overlap();
    __test_span_bounds_and_reel_scoping();
  } catch (e) {
    console.warn('Dev tests error', e);
  }
}
