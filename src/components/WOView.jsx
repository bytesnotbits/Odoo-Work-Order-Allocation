import { useState, useRef, useEffect } from "react";
import Badge from "./Badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import ProductCard from "./ProductCard";
import { naturalCompare } from "../lib/natural";
import { isMiscProductCode, MISC_PRODUCT_CODE, MISC_PRODUCT_PREFIX } from "../lib/data";

export default function WOView({
  wo, grouped, baseGrouped, getItemState, upsertAllocation, removeAllocation,
  setAssetMeta, setReelSpan, removeReelSpan, getReelSpan, listReels, getReelSpanMap, tab, allocState, setCableMode,
  addReelAllocation, updateAllocation,
  addMiscEntry, removeMiscEntry, nextMiscCode, onResetItem,
}) {
  const gm = grouped.get(wo) || new Map();
  const [miscDescription, setMiscDescription] = useState("");
  const [miscItemNumber, setMiscItemNumber] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const products = Array.from(gm.values()).sort((a, b) => naturalCompare(a.code, b.code));
  const isMiscProduct = (product) => isMiscProductCode(product.code);
  const isAccountingMode = tab === "accounting";
  const miscCardBorder = isAccountingMode ? "border-rose-200" : "border-slate-200";
  const miscCardBg = isAccountingMode ? "bg-rose-50" : "bg-slate-50";
  const miscCardText = isAccountingMode ? "text-rose-900" : "text-slate-600";
  const miscNoteText = isAccountingMode ? "text-xs text-rose-600" : "text-xs text-slate-500";
  const productStates = products.map((product) => ({ product, state: getItemState(wo, product.code) }));
  const allocatableStates = productStates.filter(({ product }) => !isMiscProduct(product));
  const allAllocated = allocatableStates.every(({ state }) => state.remaining === 0);
  const anyOverAllocated = allocatableStates.some(({ state }) => state.netAllocated > state.totalAvailable);
  const anyUnallocated = allocatableStates.some(({ state }) => state.remaining > 0);
  const allAsseted = productStates.every(({ product, state }) => {
    if (isMiscProduct(product)) return true;
    return state.extra.allocations.length === 0 || state.extra.allocations.every((a) => (allocState[`${wo}|${product.code}`]?.assets || {})[a.id]);
  });

  const rippleTimerRef = useRef(null);
  const [rippleActive, setRippleActive] = useState(false);
  const prevAllAllocatedRef = useRef(allAllocated);

  useEffect(() => () => {
    if (rippleTimerRef.current) {
      clearTimeout(rippleTimerRef.current);
      rippleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (prevAllAllocatedRef.current === allAllocated) {
      return;
    }
    if (rippleTimerRef.current) {
      clearTimeout(rippleTimerRef.current);
      rippleTimerRef.current = null;
    }
    if (allAllocated) {
      setRippleActive(true);
      rippleTimerRef.current = setTimeout(() => {
        setRippleActive(false);
        rippleTimerRef.current = null;
      }, 900);
    } else {
      setRippleActive(false);
    }
    prevAllAllocatedRef.current = allAllocated;
  }, [allAllocated]);

  const safeAlert = (msg) => {
    try {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(msg);
      }
    } catch {
      /* ignore in testing */
    }
  };

  const handleAddMisc = () => {
    if (!addMiscEntry) return;
    const userEntered = (miscItemNumber || "").trim();
    const codeToUse = userEntered || nextMiscCode;
    if (!codeToUse) {
      safeAlert("Enter an item number such as MISC-1 before submitting.");
      return;
    }
    addMiscEntry(codeToUse, miscDescription.trim());
    setMiscDescription("");
    setMiscItemNumber("");
  };

  const baseProducts = baseGrouped?.get(wo) || new Map();
  const isUserGeneratedMisc = (product) => (
    isMiscProduct(product) &&
    product.code !== MISC_PRODUCT_CODE &&
    product.code.startsWith(MISC_PRODUCT_PREFIX)
  );
  const hasManyProducts = products.length > 5;
  const activeSearchTerm = hasManyProducts ? searchTerm.trim().toLowerCase() : "";
  const normalizeSearchValue = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  };
  const matchesSearch = ({ product, state }) => {
    const extra = state?.extra || {};
    const assetEntries = Object.values(extra.assets || {});
    const assetIds = assetEntries
      .map((asset) => (typeof asset === "string" ? asset : asset?.assetId))
      .map(normalizeSearchValue)
      .filter(Boolean);
    const reelNumbers = (extra.allocations || [])
      .map((alloc) => normalizeSearchValue(alloc.reelSerial))
      .filter(Boolean);
    const searchTarget = [
      product.code,
      product.desc,
      ...assetIds,
      ...reelNumbers,
    ]
      .map(normalizeSearchValue)
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchTarget.includes(activeSearchTerm);
  };
  const visibleProductStates = activeSearchTerm ? productStates.filter(matchesSearch) : productStates;
  const visibleProducts = visibleProductStates.map(({ product }) => product);
  const isSearchActive = Boolean(activeSearchTerm);
  const wrapperClassName = [
    "space-y-6",
    "relative",
    "overflow-hidden",
    "progress-ripple-wrapper",
    allAllocated ? "progress-ripple-wrapper--complete" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={wrapperClassName}>
      <div className="relative">
        {products.length === 0 && (<div className="text-sm text-gray-600">No products for this work order.</div>)}

      {hasManyProducts && (
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-700">Search items</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="wo-search"
              type="search"
              placeholder="Search by item number or description"
              className="flex-1 border rounded-xl px-3 py-2"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {isSearchActive && (
              <div className="text-xs text-slate-500 sm:text-right sm:self-end">
                Showing {visibleProducts.length} of {products.length}
              </div>
            )}
          </div>
        </div>
      )}

      {visibleProducts.length === 0 && products.length > 0 && (
        <div className="text-sm text-gray-600">No items match that search.</div>
      )}

      <div className={`space-y-2 rounded-2xl border border-dashed p-3 text-sm ${miscCardBorder} ${miscCardBg} ${miscCardText}`}>
        <div className="flex items-center justify-between">
          <div className={`font-medium ${isAccountingMode ? "text-rose-900" : "text-slate-900"}`}>Add miscellaneous material</div>
          <div className={miscNoteText}>Provisional only</div>
        </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="misc-item-number"
              type="text"
              placeholder={nextMiscCode ? `${nextMiscCode}` : "Item number (e.g., MISC-1)"}
              className="border rounded-xl px-3 py-2 w-full sm:w-48"
              value={miscItemNumber}
              onChange={(e) => setMiscItemNumber(e.target.value)}
            />
            <input
              name="misc-description"
              type="text"
              placeholder="Description (optional)"
              className="flex-1 border rounded-xl px-3 py-2"
              value={miscDescription}
              onChange={(e) => setMiscDescription(e.target.value)}
            />
          <button
            type="button"
            className="whitespace-nowrap rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-slate-800"
            onClick={handleAddMisc}
          >
            Add item
          </button>
        </div>
      </div>

      {visibleProducts.map((p) => {
        const isImported = baseProducts.has(p.code);
        const removableMisc = isUserGeneratedMisc(p) && !isImported;
        const canRemoveMisc = removableMisc && typeof removeMiscEntry === "function";
        return (
          <ProductCard
          key={p.code}
          wo={wo}
          product={p}
          getItemState={getItemState}
          upsertAllocation={upsertAllocation}
          removeAllocation={removeAllocation}
          setAssetMeta={setAssetMeta}
          setReelSpan={setReelSpan}
          removeReelSpan={removeReelSpan}
          getReelSpan={getReelSpan}
          listReels={listReels}
          getReelSpanMap={getReelSpanMap}
          setCableMode={setCableMode}
          addReelAllocation={addReelAllocation}
          updateAllocation={updateAllocation}
          tab={tab}
          locked={(allocState[`${wo}|${p.code}`]?.locked) || false}
          isMiscRemovable={removableMisc}
          onRemoveMisc={canRemoveMisc ? () => removeMiscEntry?.(p.code) : undefined}
          onResetItem={onResetItem}
        />
      )})}

      <div className="flex items-center gap-3 pt-2 border-t">
        {(anyOverAllocated || anyUnallocated) && (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Open issues: resolve before submitting for close</Badge>
        )}
        {allAllocated ? (
          <Badge><CheckCircle2 className="inline w-4 h-4 mr-1" /> Engineering: All material allocated</Badge>
        ) : (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Engineering: Unallocated material remains</Badge>
        )}
        {allAsseted ? (
          <Badge><CheckCircle2 className="inline w-4 h-4 mr-1" /> Accounting: Asset IDs assigned</Badge>
        ) : (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Accounting: Asset IDs missing</Badge>
        )}
      </div>
      </div>
      <span
        className={`progress-ripple ${rippleActive ? "progress-ripple--visible" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
}
