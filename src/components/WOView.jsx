import { useState } from "react";
import Badge from "./Badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import ProductCard from "./ProductCard";
import { naturalCompare } from "../lib/natural";
import { isMiscProductCode, MISC_PRODUCT_CODE, MISC_PRODUCT_PREFIX } from "../lib/data";

export default function WOView({
  wo, grouped, baseGrouped, getItemState, upsertAllocation, removeAllocation,
  setAssetMeta, setReelSpan, removeReelSpan, getReelSpan, listReels, lockWorkOrder, tab, allocState, setCableMode,
  addMiscEntry, removeMiscEntry, nextMiscCode
}) {
  const gm = grouped.get(wo) || new Map();
  const [miscDescription, setMiscDescription] = useState("");
  const [miscItemNumber, setMiscItemNumber] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const products = Array.from(gm.values()).sort((a, b) => naturalCompare(a.code, b.code));
  const isMiscProduct = (product) => isMiscProductCode(product.code);
  const productStates = products.map((product) => ({ product, state: getItemState(wo, product.code) }));
  const allocatableStates = productStates.filter(({ product }) => !isMiscProduct(product));
  const allAllocated = allocatableStates.every(({ state }) => state.remaining === 0);
  const anyOverAllocated = allocatableStates.some(({ state }) => state.netAllocated > state.totalAvailable);
  const anyUnallocated = allocatableStates.some(({ state }) => state.remaining > 0);
  const allAsseted = productStates.every(({ product, state }) => {
    if (isMiscProduct(product)) return true;
    return state.extra.allocations.length === 0 || state.extra.allocations.every((a) => (allocState[`${wo}|${product.code}`]?.assets || {})[a.id]);
  });

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
  const matchesSearch = (product) => {
    if (!activeSearchTerm) return true;
    const searchTarget = `${product.code} ${product.desc || ""}`.toLowerCase();
    return searchTarget.includes(activeSearchTerm);
  };
  const visibleProducts = activeSearchTerm ? products.filter(matchesSearch) : products;
  const isSearchActive = Boolean(activeSearchTerm);

  return (
    <div className="space-y-6">
      {products.length === 0 && (<div className="text-sm text-gray-600">No products for this work order.</div>)}

      {hasManyProducts && (
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-700">Search items</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
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

      <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="flex items-center justify-between">
          <div className="font-medium text-slate-900">Add miscellaneous material</div>
          <div className="text-xs text-slate-500">Provisional only</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder={nextMiscCode ? `${nextMiscCode}` : "Item number (e.g., MISC-1)"}
            className="border rounded-xl px-3 py-2 w-full sm:w-48"
            value={miscItemNumber}
            onChange={(e) => setMiscItemNumber(e.target.value)}
          />
          <input
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
          setCableMode={setCableMode}
          tab={tab}
          locked={(allocState[`${wo}|${p.code}`]?.locked) || false}
          isMiscRemovable={removableMisc}
          onRemoveMisc={canRemoveMisc ? () => removeMiscEntry?.(p.code) : undefined}
        />
      )})}

      <div className="flex items-center gap-3 pt-2 border-t">
        {(anyOverAllocated || anyUnallocated) && (
          <Badge><AlertTriangle className="inline w-4 h-4 mr-1" /> Open issues: resolve before completion</Badge>
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
        <button
          onClick={() => lockWorkOrder(wo)}
          disabled={anyOverAllocated || anyUnallocated}
          title={(anyOverAllocated || anyUnallocated) ? "Resolve issues before completion" : ""}
          className={[
            "ml-auto px-3 py-2 rounded-xl border shadow-sm disabled:opacity-50",
            (anyOverAllocated || anyUnallocated)
              ? "bg-gray-100 text-gray-500 border-gray-200"
              : "bg-gray-900 text-white border-gray-900 hover:bg-gray-800 active:bg-gray-700"
          ].join(" ")}
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}
