import { useState } from "react";
import { ALLOCATION_OPTIONS } from "../lib/data";
import Badge from "./Badge";
import { Plus, Trash2, Ruler } from "lucide-react";

export default function ProductCard({
  wo, product, getItemState,
  upsertAllocation, removeAllocation, setAssetId, setAssetMeta,
  setReelSpan, getReelSpan, listReels, setCableMode, tab, locked
}) {
  // Avoid throwing in test environment where window.alert is "not implemented"
  const safeAlert = (msg) => {
    try { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg) } catch { /* no-op in tests */ }
  };
  const { base, extra, totalAvailable, allocatedSum, remaining, cableMode, cableSuggested } = getItemState(wo, product.code);
  const [allocQty, setAllocQty] = useState("");
  const [allocId, setAllocId] = useState("");
  const [allocCategory, setAllocCategory] = useState(ALLOCATION_OPTIONS[0]);
  const [allocCategoryCustom, setAllocCategoryCustom] = useState("");
  const [outer, setOuter] = useState("");
  const [inner, setInner] = useState("");
  const [reelSerial, setReelSerial] = useState("");
  const [spanStartInput, setSpanStartInput] = useState("");
  const [spanEndInput, setSpanEndInput] = useState("");

  if (!base) return null;

  const reelFootage = Math.abs((Number(inner) || 0) - (Number(outer) || 0));
  const currentSpan = reelSerial ? getReelSpan(wo, product.code, reelSerial) : { start: "", end: "" };
  const spanStartNum = isFinite(Number(currentSpan.start)) ? Number(currentSpan.start) : null;
  const spanEndNum = isFinite(Number(currentSpan.end)) ? Number(currentSpan.end) : null;
  const spanMin = spanStartNum !== null && spanEndNum !== null ? Math.min(spanStartNum, spanEndNum) : null;
  const spanMax = spanStartNum !== null && spanEndNum !== null ? Math.max(spanStartNum, spanEndNum) : null;
  const primaryButton = [
    "inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition font-semibold shadow-sm",
    "bg-blue-600 text-white border-blue-600",
    "hover:bg-blue-700 active:bg-blue-800",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500",
    "disabled:bg-blue-200 disabled:border-blue-200 disabled:text-white disabled:cursor-not-allowed",
  ].join(" ");

  const finalCategory = () =>
    allocCategory === "__custom__" ? (allocCategoryCustom || "Custom") : allocCategory;
  const isCustomCategory = () => allocCategory === "__custom__";

  function addRegular() {
    const qty = Number(allocQty);
    if (!qty || qty <= 0) return safeAlert("Enter a positive quantity");
    if (qty > remaining) return safeAlert("Quantity exceeds remaining available");
    upsertAllocation(wo, product.code, {
      type: "regular",
      qty,
      allocationId: allocId || "",
      allocationCategory: finalCategory(),
      allocationCategoryIsCustom: isCustomCategory(),
      reelSerial
    });    setAllocQty(""); setAllocId(""); setReelSerial(""); setAllocCategory(ALLOCATION_OPTIONS[0]); setAllocCategoryCustom("");
  }

  function addReelPiece() {
    if (!reelSerial) return safeAlert("Enter a Reel/Serial Number for this piece");
    if (reelFootage <= 0) return safeAlert("Enter valid outer/inner to compute footage");
    if (reelFootage > remaining) return safeAlert("Footage exceeds remaining available");

    const s = Math.min(Number(outer), Number(inner));
    const e = Math.max(Number(outer), Number(inner));
    const hasSpan = (spanMin !== null && spanMax !== null);
      if (hasSpan) {
      if (s < spanMin || e > spanMax) return safeAlert("Piece is outside the defined span range");
      for (const a of extra.allocations) {
        if (a.type !== "reel" || a.outer == null || a.inner == null) continue;
        if ((a.reelSerial || "") !== reelSerial) continue;
        const es = Math.min(a.outer, a.inner);
        const ee = Math.max(a.outer, a.inner);
        if (Math.min(e, ee) > Math.max(s, es)) return safeAlert(`Overlap with existing piece [${es}–${ee}]`);
      }
    }
    upsertAllocation(wo, product.code, {
      type: "reel",
      outer: Number(outer),
      inner: Number(inner),
      footage: reelFootage,
      allocationId: allocId || "",
      allocationCategory: finalCategory(),
      allocationCategoryIsCustom: isCustomCategory(),
      reelSerial
    });    setOuter(""); setInner(""); setAllocId(""); setReelSerial(""); setAllocCategory(ALLOCATION_OPTIONS[0]); setAllocCategoryCustom("");
  }

  return (
    <div className="border rounded-2xl p-4">
      <div className="flex-1">
        <div className="font-semibold text-base md:text-lg">[{product.code}] {product.desc || "Unnamed"}</div>
        <div className="text-sm text-gray-600 flex flex-wrap gap-3 mt-1">
          <span>Total: <b>{product.posted}</b></span>
          <span>Returned: <b>{product.returned}</b></span>
          <span>To Allocate: <b>{totalAvailable}</b></span>
          <span>Allocated: <b>{allocatedSum}</b></span>
          <span className={remaining === 0 ? "text-green-600" : "text-amber-600"}>Unallocated: <b>{remaining}</b></span>
          {product.isCable && <Badge>Cable (auto-detected)</Badge>}
          {allocatedSum > totalAvailable && <span className="text-red-600 font-medium">Over-allocated — adjust allocations</span>}
        </div>
      </div>

      {tab === "engineering" && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {/* LEFT: Add allocation (unchanged) */}
          <div className="bg-gray-50 rounded-xl p-3 border">
            <div className="font-medium mb-2">Add allocation</div>

            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm font-medium">Track by reel?</label>
              <button
                type="button"
                className={[
                  "px-3 py-1 rounded-lg border text-sm transition font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900",
                  cableMode
                    ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                    : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50"
                ].join(" ")}
                onClick={() => setCableMode(wo, product.code, !cableMode)}
                aria-pressed={cableMode}
              >
                {cableMode ? "Reel tracking on" : "Reel tracking off"}
              </button>
              {!cableMode && cableSuggested && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                  Looks like cable (description). Turn on if you need reels.
                </span>
              )}
            </div>

            {!cableMode && (
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
                <button
                  type="button"
                  onClick={addRegular}
                  className={primaryButton}
                  aria-label="Add Span"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span className="font-medium">Add Span</span>
                </button>
              </div>
            )}

            {cableMode && (
              <div className="space-y-2">
                {/* Reel & span */}
                <div className="bg-white border rounded-xl p-3">
                  <div className="font-medium mb-1">Reel & span (optional)</div>
                  <div className="grid md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-sm">Reel/Serial Number</label>
                      <input className="w-full border rounded-xl p-2" value={reelSerial} onChange={(e)=> setReelSerial(e.target.value)} placeholder="REEL-XXXXX" />
                      {listReels(wo, product.code).length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">Known reels: {listReels(wo, product.code).join(", ")}</div>
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
                    if (!reelSerial) return safeAlert("Enter reel/serial to save a span");
                      const s = Number(spanStartInput); const e = Number(spanEndInput);
                    if (!isFinite(s) || !isFinite(e)) return safeAlert("Enter numeric span start/end");
                      setReelSpan(wo, product.code, reelSerial, s, e);
                    }} className={primaryButton + " px-3 py-1"}>Save span</button>
                  </div>
                  {/* Coverage summary */}
                  {(() => {
                    if (!reelSerial) return null;
                    const rs = getReelSpan(wo, product.code, reelSerial);
                    const s = Number(rs?.start), e = Number(rs?.end);
                    if (isFinite(s) && isFinite(e)) {
                      const total = Math.abs(e - s);
                      const covered = extra.allocations
                        .filter(a => a.type === "reel" && (a.reelSerial || "") === reelSerial && a.outer != null && a.inner != null)
                        .reduce((sum, a) => sum + Math.abs(a.outer - a.inner), 0);
                      const remainingSpan = Math.max(total - covered, 0);
                      return <div className="text-sm text-gray-600 mt-2">[{reelSerial}] Span total: <b>{total}</b> | Covered: <b>{covered}</b> | Remaining: <b>{remainingSpan}</b></div>;
                    }
                    return <div className="text-sm text-gray-500 mt-2">No span saved for this reel yet.</div>;
                  })()}
                </div>

                {/* Reel piece */}
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
                <button disabled={locked} onClick={addReelPiece} className={primaryButton}><Plus className="w-4 h-4" /> Add piece</button>
              </div>
            )}
          </div>

          {/* RIGHT: Allocations table (engineering can also capture asset meta) */}
          <div className="bg-gray-50 rounded-xl p-3 border overflow-x-auto">
              <div className="font-medium mb-2">Allocations</div>
            <div data-testid="allocations-scroll" className="-mx-2 sm:mx-0 overflow-x-auto">
              <table className="min-w-[960px] sm:min-w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium [&>th]:whitespace-nowrap text-gray-600">
                    <th className="w-16">Type</th>
                    <th className="w-24">Qty/Footage</th>
                    <th className="w-20">Outer</th>
                    <th className="w-20">Inner</th>
                    <th className="min-w-[160px]">Allocation Notes</th>
                    <th className="min-w-[140px]">Category</th>
                    <th className="min-w-[140px]">Reel/Serial</th>
                    <th className="min-w-[140px]">Asset ID</th>
                    <th className="min-w-[120px]">COE LOC</th>
                    <th className="min-w-[120px]">RACK/BAY</th>
                    <th className="min-w-[100px]">SEPCAT</th>
                    <th className="w-14 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:px-2 [&>tr>td]:py-1">
                  {extra.allocations.length === 0 ? (
                    <tr><td colSpan={12} className="text-sm text-gray-600 py-3">No allocations yet.</td></tr>
                  ) : (
                    extra.allocations.map(a => {
                      const raw = (extra.assets && extra.assets[a.id]) || {};
                      const m = typeof raw === 'object'
                        ? raw
                        : { assetId: raw ?? '', coeLoc: '', rackBay: '', sepcat: '' };
                      return (
                      <tr key={a.id} className="border-t">                        <td className="whitespace-nowrap">{a.type}</td>
                        <td className="whitespace-nowrap">{a.type === 'reel' ? a.footage : a.qty}</td>
                        <td className="whitespace-nowrap">{a.type === 'reel' ? a.outer : ''}</td>
                        <td className="whitespace-nowrap">{a.type === 'reel' ? a.inner : ''}</td>
                        <td title={a.allocationId || ''} className="truncate max-w-[240px]">{a.allocationId || ''}</td>
                        <td className="whitespace-nowrap">{a.allocationCategory || ''}</td>
                        <td className="whitespace-nowrap">{a.reelSerial || ''}</td>
                        <td className="py-1">
                          <input
                            className="border rounded-lg p-1 w-40"
                            placeholder="Asset ID"
                            value={m.assetId || ''}
                            onChange={(e) => setAssetMeta(wo, product.code, a.id, { assetId: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          <input
                            className="border rounded-lg p-1 w-32"
                            placeholder="COE LOC"
                            value={m.coeLoc || ''}
                            onChange={(e) => setAssetMeta(wo, product.code, a.id, { coeLoc: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          <input
                            className="border rounded-lg p-1 w-32"
                            placeholder="RACK/BAY"
                            value={m.rackBay || ''}
                            onChange={(e) => setAssetMeta(wo, product.code, a.id, { rackBay: e.target.value })}
                          />
                        </td>
                        <td className="py-1">
                          <input
                            className="border rounded-lg p-1 w-28"
                            placeholder="SEPCAT"
                            value={m.sepcat || ''}
                            onChange={(e) => setAssetMeta(wo, product.code, a.id, { sepcat: e.target.value })}
                          />
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="inline-flex px-2 py-1 rounded border"
                            onClick={() => removeAllocation(wo, product.code, a.id)}
                            aria-label="Remove allocation"
                            disabled={locked}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "accounting" && (
        <div className="mt-4 bg-gray-50 rounded-xl p-3 border overflow-x-auto">
          {extra.allocations.length === 0 ? (
            <div className="text-sm text-gray-600">No allocations to assign assets.</div>
          ) : (
            <table className="min-w-[960px] sm:min-w-full text-sm">
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
                  <th className="py-1 pr-3">COE LOC</th>
                  <th className="py-1 pr-3">RACK/BAY</th>
                  <th className="py-1 pr-3">SEPCAT</th>
                </tr>
              </thead>
              <tbody>
                {extra.allocations.map((a) => {
                  const meta = (extra.assets && extra.assets[a.id]) || {};
                  const assetMeta = typeof meta === 'object' ? meta : { assetId: meta ?? '', coeLoc: '', rackBay: '', sepcat: '' };
                  return (<tr key={a.id} className="border-t">
                    <td className="py-1 pr-3">{a.type}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.footage : a.qty}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.outer : ""}</td>
                    <td className="py-1 pr-3">{a.type === "reel" ? a.inner : ""}</td>
                    <td className="py-1 pr-3">{a.allocationId}</td>
                    <td className="py-1 pr-3">{a.allocationCategory || ""}</td>
                    <td className="py-1 pr-3">{a.reelSerial || ""}</td>
                    <td className="py-1 pr-3">
                      <input className="border rounded-lg p-1 w-40" placeholder="Asset ID"
                        value={assetMeta.assetId || ''}
                        onChange={(e) => setAssetMeta(wo, product.code, a.id, { assetId: e.target.value })} />
                    </td>
                    <td className="py-1 pr-3">
                      <input className="border rounded-lg p-1 w-32" placeholder="COE LOC"
                        value={assetMeta.coeLoc || ''}
                        onChange={(e) => setAssetMeta(wo, product.code, a.id, { coeLoc: e.target.value })} />
                    </td>
                    <td className="py-1 pr-3">
                      <input className="border rounded-lg p-1 w-32" placeholder="RACK/BAY"
                        value={assetMeta.rackBay || ''}
                        onChange={(e) => setAssetMeta(wo, product.code, a.id, { rackBay: e.target.value })} />
                    </td>
                    <td className="py-1 pr-3">
                      <input className="border rounded-lg p-1 w-28" placeholder="SEPCAT"
                        value={assetMeta.sepcat || ''}
                        onChange={(e) => setAssetMeta(wo, product.code, a.id, { sepcat: e.target.value })} />
                     </td>
                  </tr>)})}
               </tbody>
             </table>
           )}
         </div>
       )}
    </div>
  );
}
