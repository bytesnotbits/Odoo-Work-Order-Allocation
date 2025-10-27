import Badge from "./Badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import ProductCard from "./ProductCard";

export default function WOView({
  wo, grouped, getItemState, upsertAllocation, removeAllocation, setAssetId,
  setAssetMeta, setReelSpan, getReelSpan, listReels, lockWorkOrder, tab, allocState
}) {
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
          setAssetMeta={setAssetMeta}
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
          className="ml-auto px-3 py-2 rounded-xl border disabled:opacity-50"
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}