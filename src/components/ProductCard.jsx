import { useState } from "react";
import { ALLOCATION_OPTIONS, MISC_PRODUCT_NOTE, isMiscProductCode } from "../lib/data";
import Badge from "./Badge";
import { Plus, Trash2, Ruler } from "lucide-react";

export default function ProductCard({
  wo, product, getItemState,
  upsertAllocation, removeAllocation, setAssetMeta,
  setReelSpan, removeReelSpan, getReelSpan, listReels, setCableMode, addReelAllocation, updateAllocation, tab, locked,
  isMiscRemovable = false, onRemoveMisc
}) {
  // Avoid throwing in test environment where window.alert is "not implemented"
  const safeAlert = (msg) => {
    try { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg) } catch { /* no-op in tests */ }
  };
  const formatSpanInput = (value) => (value === "" || value === undefined || value === null) ? "" : String(value);
  const {
    base, extra, totalAvailable, allocatedSum,
    pendingReturnSum, returnedSum, netAllocated, remaining,
    cableMode, cableSuggested
  } = getItemState(wo, product.code);
  const isMiscProduct = isMiscProductCode(product.code);
  const [allocQty, setAllocQty] = useState("");
  const [allocId, setAllocId] = useState("");
  const [allocCategory, setAllocCategory] = useState(ALLOCATION_OPTIONS[0]);
  const [allocCategoryCustom, setAllocCategoryCustom] = useState("");
  const [outer, setOuter] = useState("");
  const [inner, setInner] = useState("");
  const [reelSerial, setReelSerial] = useState("");
  const [spanStartInput, setSpanStartInput] = useState("");
  const [spanEndInput, setSpanEndInput] = useState("");
  const [selectedAllocation, setSelectedAllocation] = useState(null);

  if (!base) return null;

  const reelFootage = Math.abs((Number(inner) || 0) - (Number(outer) || 0));
  const knownReels = listReels(wo, product.code);
  const currentSpan = reelSerial ? getReelSpan(wo, product.code, reelSerial) : { start: "", end: "" };
  const spanStartNum = isFinite(Number(currentSpan.start)) ? Number(currentSpan.start) : null;
  const spanEndNum = isFinite(Number(currentSpan.end)) ? Number(currentSpan.end) : null;
  const spanMin = spanStartNum !== null && spanEndNum !== null ? Math.min(spanStartNum, spanEndNum) : null;
  const spanMax = spanStartNum !== null && spanEndNum !== null ? Math.max(spanStartNum, spanEndNum) : null;
  const handleSelectReel = (serial) => {
    const span = getReelSpan(wo, product.code, serial);
    setReelSerial(serial);
    setSpanStartInput(formatSpanInput(span?.start));
    setSpanEndInput(formatSpanInput(span?.end));
  };
  const handleRemoveReel = (serial) => {
    removeReelSpan(wo, product.code, serial);
    if (serial === reelSerial) {
      setReelSerial("");
      setSpanStartInput("");
      setSpanEndInput("");
    }
  };
  const reelSpanSummaries = knownReels.map((serial) => {
    const span = getReelSpan(wo, product.code, serial);
    const s = Number(span?.start);
    const e = Number(span?.end);
    if (!isFinite(s) || !isFinite(e)) {
      return { serial, hasSpan: false };
    }
    const total = Math.abs(e - s);
    const covered = extra.allocations
      .filter(a => a.type === "reel" && (a.reelSerial || "") === serial && a.outer != null && a.inner != null)
      .reduce((sum, a) => sum + Math.abs(a.outer - a.inner), 0);
    const remainingSpan = Math.max(total - covered, 0);
    return { serial, hasSpan: true, total, covered, remainingSpan };
  });
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
  const isReturnCategory = (category) => ["Returned", "Pending"].includes(category);

  function addRegular() {
    const qty = Number(allocQty);
    if (!qty || qty <= 0) return safeAlert("Enter a positive quantity");
    const categoryName = finalCategory();
    const isReturn = isReturnCategory(categoryName);
    if (!isReturn && !isMiscProduct && qty > remaining) return safeAlert("Quantity exceeds remaining available");
    const payload = {
      type: "regular",
      qty,
      allocationId: allocId || "",
      allocationCategory: categoryName,
      allocationCategoryIsCustom: isCustomCategory(),
      reelSerial,
    };
    if (selectedAllocation?.id && selectedAllocation.type !== "reel" && typeof updateAllocation === "function") {
      updateAllocation(wo, product.code, selectedAllocation.id, payload);
    } else {
      upsertAllocation(wo, product.code, payload);
    }
    setAllocQty("");
    setAllocId("");
    setReelSerial("");
    setAllocCategory(ALLOCATION_OPTIONS[0]);
    setAllocCategoryCustom("");
    setSelectedAllocation(null);
  }

  function addReelPiece() {
    if (!reelSerial) return safeAlert("Enter a Reel/Serial Number for this piece");
    if (reelFootage <= 0) return safeAlert("Enter valid outer/inner to compute footage");
    const categoryName = finalCategory();
    const isReturn = isReturnCategory(categoryName);
    if (!isReturn && !isMiscProduct && reelFootage > remaining) return safeAlert("Footage exceeds remaining available");

    const s = Math.min(Number(outer), Number(inner));
    const e = Math.max(Number(outer), Number(inner));
    const hasSpan = (spanMin !== null && spanMax !== null);
    if (hasSpan) {
      if (s < spanMin || e > spanMax) return safeAlert("Piece is outside the defined span range");
    }

    const basePayload = {
      type: "reel",
      outer: Number(outer),
      inner: Number(inner),
      allocationId: allocId || "",
      allocationCategory: categoryName,
      allocationCategoryIsCustom: isCustomCategory(),
      reelSerial,
    };

    if (hasSpan && !addReelAllocation) {
      for (const a of extra.allocations) {
        if (a.type !== "reel" || a.outer == null || a.inner == null) continue;
        if ((a.reelSerial || "") !== reelSerial) continue;
        const es = Math.min(a.outer, a.inner);
        const ee = Math.max(a.outer, a.inner);
        if (Math.min(e, ee) > Math.max(s, es)) return safeAlert(`Overlap with existing piece [${es}–${ee}]`);
      }
    }

    const editingReel = selectedAllocation?.id && selectedAllocation.type === "reel";
    if (addReelAllocation) {
      const result = addReelAllocation(wo, product.code, basePayload, editingReel ? { replaceId: selectedAllocation.id } : undefined);
      if (result?.error) return safeAlert(result.error);
      setOuter("");
      setInner("");
      setAllocId("");
      setReelSerial("");
      setAllocCategory(ALLOCATION_OPTIONS[0]);
      setAllocCategoryCustom("");
      setSelectedAllocation(null);
      return;
    }

    const payload = { ...basePayload, footage: reelFootage };
    upsertAllocation(wo, product.code, payload);

    setOuter("");
    setInner("");
    setAllocId("");
    setReelSerial("");
    setAllocCategory(ALLOCATION_OPTIONS[0]);
    setAllocCategoryCustom("");
    setSelectedAllocation(null);
  }

  const defaultCategory = ALLOCATION_OPTIONS[0] || "";
  const handleSelectAllocation = (alloc) => {
    setSelectedAllocation(alloc);
    setAllocId(alloc.allocationId || "");
    if (alloc.allocationCategoryIsCustom) {
      setAllocCategory("__custom__");
      setAllocCategoryCustom(alloc.allocationCategory || "");
    } else {
      setAllocCategory(alloc.allocationCategory || defaultCategory);
      setAllocCategoryCustom("");
    }
    setReelSerial(alloc.reelSerial || "");
    if (alloc.type === "reel") {
      setOuter(formatSpanInput(alloc.outer));
      setInner(formatSpanInput(alloc.inner));
      setAllocQty("");
    } else {
      setAllocQty(alloc.qty != null ? String(alloc.qty) : "");
      setOuter("");
      setInner("");
    }
  };

  const hasUnresolvedQuantities = remaining > 0 || pendingReturnSum > 0;
  const cardStateClasses = hasUnresolvedQuantities
    ? "bg-white border-gray-200"
    : "bg-green-50 border-green-200";

  const totalPosted = Number(product.posted) || 0;
  const toAllocateTone = hasUnresolvedQuantities ? "red" : "green";
  const chipBase = "px-2 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wide";
  const chipToneClasses = {
    slate: "border-slate-200 bg-white text-slate-600",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  const summaryChips = [
    { label: "Total", value: totalPosted, tone: "slate", title: "Total posted quantity" },
    { label: "Returned", value: returnedSum, tone: "blue", title: "Reported returned quantity" },
    { label: "Pending", value: pendingReturnSum, tone: "yellow", title: "Footage marked pending" },
    { label: "Allocated", value: allocatedSum, tone: "emerald", title: "Footage recorded as allocated" },
    { label: "To Allocate", value: remaining, tone: toAllocateTone, title: "Footage that still needs allocation" },
  ];

  return (
    <div className={`rounded-2xl p-4 border ${cardStateClasses}`}>
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold text-base md:text-lg">[{product.code}] {product.desc || "Unnamed"}</div>
          {isMiscProduct && onRemoveMisc && (
            <button
              type="button"
              className={[
                "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border transition",
                (!isMiscRemovable || locked)
                  ? "border-gray-200 bg-white text-gray-400 cursor-not-allowed"
                  : "border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500"
              ].join(" ")}
              onClick={(event) => {
                event.stopPropagation();
                if (!isMiscRemovable || locked) return;
                onRemoveMisc();
              }}
              disabled={!isMiscRemovable || locked}
              title={(!isMiscRemovable || locked) ? "Cannot remove this item once imported or locked" : "Remove this miscellaneous item"}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Remove</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-1 text-[11px]">
          {summaryChips.map(({ label, value, tone, title }) => (
            <span
              key={label}
              title={title}
              className={`${chipBase} ${chipToneClasses[tone] || chipToneClasses.slate}`}
            >
              {label}: <b>{value}</b>
            </span>
          ))}
          {product.isCable && <Badge>Cable (auto-detected)</Badge>}
          {netAllocated > totalAvailable && (
            <span className="text-red-600 font-medium">Over-allocated — adjust allocations</span>
          )}
        </div>
        {isMiscProduct && (
          <div className="text-xs text-gray-500 mt-1 leading-snug">
            {MISC_PRODUCT_NOTE}
          </div>
        )}
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
                  aria-label="Add Asset"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span className="font-medium">Add Asset</span>
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
                      {knownReels.length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">
                          <div className="text-[11px] uppercase tracking-wide mb-1 text-slate-500">Known reels</div>
                          <div className="flex flex-wrap gap-2">
                            {knownReels.map((serial) => (
                              <div key={serial} className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className={[
                                    "px-2 py-1 rounded-full border text-[11px] transition",
                                    serial === reelSerial
                                      ? "bg-slate-900 text-white border-slate-900"
                                      : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
                                  ].join(" ")}
                                  onClick={() => handleSelectReel(serial)}
                                >
                                  {serial}
                                </button>
                                <button
                                  type="button"
                                  className="flex items-center justify-center w-5 h-5 rounded-full border border-red-200 text-red-600 text-[10px] bg-white hover:bg-red-50"
                                  aria-label={`Remove reel ${serial}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveReel(serial);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm">Inner Seq</label>
                      <input type="number" className="w-full border rounded-xl p-2" value={spanStartInput} onChange={(e)=>setSpanStartInput(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm">Outer Seq</label>
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
                  {knownReels.length === 0 ? (
                    <div className="text-sm text-gray-500 mt-2">No spans saved for this product yet.</div>
                  ) : (
                    <div className="space-y-1 text-sm mt-2">
                      {reelSpanSummaries.map(({ serial, hasSpan, total, covered, remainingSpan }) => (
                        hasSpan ? (
                          <div
                            key={serial}
                            className={`text-gray-600 ${serial === reelSerial ? "text-gray-800 font-semibold" : ""}`}
                          >
                            [{serial}] Span total: <b>{total}</b> | Covered: <b>{covered}</b> | Remaining: <b>{remainingSpan}</b>
                          </div>
                        ) : (
                          <div key={serial} className="text-gray-500">
                            [{serial}] No span saved for this reel yet.
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>

                {/* Reel piece */}
                <div className="flex items-center gap-2"><Ruler className="w-4 h-4" /> <div className="font-medium">Reel piece</div></div>
                <div className="grid md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm">Reel/Serial Number <span className="text-red-500">*</span></label>
                    <input className="w-full border rounded-xl p-2" value={reelSerial} onChange={(e) => setReelSerial(e.target.value)} placeholder="REEL-XXXXX" />
                  </div>
                  <div>
                    <label className="block text-sm">Inner Seq</label>
                    <input type="number" className="w-full border rounded-xl p-2" value={inner} onChange={(e) => setInner(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm">Outer Seq</label>
                    <input type="number" className="w-full border rounded-xl p-2" value={outer} onChange={(e) => setOuter(e.target.value)} />
                  </div>
                </div>
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
                <button disabled={locked} onClick={addReelPiece} className={primaryButton}><Plus className="w-4 h-4" /> Add piece</button>
              </div>
            )}
          </div>

          {/* RIGHT: Allocations (engineering can also capture asset meta) */}
          <div className="bg-gray-50 rounded-xl p-3 border">
            <div className="font-medium mb-2">Allocations</div>
            {extra.allocations.length === 0 ? (
              <div className="text-sm text-gray-600 py-3">No allocations yet.</div>
            ) : (
              <div className="space-y-3">
                {extra.allocations.map((a) => {
                const isPendingReturn = a.allocationCategory === "Pending";
                const isReturned = a.allocationCategory === "Returned";
                const raw = (extra.assets && extra.assets[a.id]) || {};
                const meta = typeof raw === "object"
                  ? raw
                  : { assetId: raw ?? "", coeLoc: "", rackBay: "", sepcat: "" };
                const numericValue = a.type === "reel" ? a.footage : a.qty;
                const outerValue = a.type === "reel" ? (a.outer ?? "—") : "—";
                const innerValue = a.type === "reel" ? (a.inner ?? "—") : "—";
                const chipBase = "px-2 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wide";
                const chipColor = isPendingReturn
                  ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                  : isReturned
                    ? "border-slate-200 bg-white text-slate-400"
                    : "border-slate-200 bg-white text-slate-600";
                const cardColor = isPendingReturn
                    ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                    : isReturned
                      ? "border-slate-200 bg-slate-100 text-slate-500"
                      : "border-slate-200 bg-white text-slate-900";
                  const inputBase = "w-full border rounded-lg px-2 py-1 text-sm";
                const isSelectedAllocation = selectedAllocation?.id === a.id;
                const selectionClasses = isSelectedAllocation ? "ring-2 ring-blue-500/50 shadow-lg" : "hover:shadow-md";
                return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectAllocation(a)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectAllocation(a);
                        }
                      }}
                      className={`rounded-2xl border p-3 shadow-sm ${cardColor} ${selectionClasses} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm font-semibold">
                          {a.type === "reel" ? "Reel piece" : "Quantity allocation"}
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center px-2 py-1 rounded border text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeAllocation(wo, product.code, a.id);
                          }}
                          aria-label="Remove allocation"
                          disabled={locked}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                        <span className={`${chipBase} ${chipColor}`}>
                          Qty/Footage: <b className="text-xs uppercase">{numericValue ?? 0}</b>
                        </span>
                        <span className={`${chipBase} ${chipColor}`}>
                          Outer: <b>{outerValue}</b>
                        </span>
                        <span className={`${chipBase} ${chipColor}`}>
                          Inner: <b>{innerValue}</b>
                        </span>
                        <span className={`${chipBase} ${chipColor}`}>
                          Reel/Serial: <b>{a.reelSerial || "—"}</b>
                        </span>
                        <span className={`${chipBase} ${chipColor}`}>
                          Category: <b>{a.allocationCategory || "Uncategorized"}</b>
                        </span>
                        {a.allocationId && (
                          <span className={`${chipBase} ${chipColor}`}>
                            Notes: <b>{a.allocationId}</b>
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Asset ID</div>
                          {isPendingReturn ? (
                            <div className="text-xs text-yellow-700 uppercase tracking-wide">Info only</div>
                          ) : (
                            <input
                              className={inputBase}
                              placeholder="Asset ID"
                              value={meta.assetId || ""}
                              onChange={(e) => setAssetMeta(wo, product.code, a.id, { assetId: e.target.value })}
                              onMouseDown={(event) => event.stopPropagation()}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">COE LOC</div>
                          {isPendingReturn ? (
                            <div className="text-xs text-yellow-700 uppercase tracking-wide">Info only</div>
                          ) : (
                            <input
                              className={inputBase}
                              placeholder="COE LOC"
                              value={meta.coeLoc || ""}
                              onChange={(e) => setAssetMeta(wo, product.code, a.id, { coeLoc: e.target.value })}
                              onMouseDown={(event) => event.stopPropagation()}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rack/Bay</div>
                          {isPendingReturn ? (
                            <div className="text-xs text-yellow-700 uppercase tracking-wide">Info only</div>
                          ) : (
                            <input
                              className={inputBase}
                              placeholder="RACK/BAY"
                              value={meta.rackBay || ""}
                              onChange={(e) => setAssetMeta(wo, product.code, a.id, { rackBay: e.target.value })}
                              onMouseDown={(event) => event.stopPropagation()}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">SEPCAT</div>
                          {isPendingReturn ? (
                            <div className="text-xs text-yellow-700 uppercase tracking-wide">Info only</div>
                          ) : (
                            <input
                              className={inputBase}
                              placeholder="SEPCAT"
                              value={meta.sepcat || ""}
                              onChange={(e) => setAssetMeta(wo, product.code, a.id, { sepcat: e.target.value })}
                              onMouseDown={(event) => event.stopPropagation()}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
