import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileUp, Package2, Split, Download } from "lucide-react";

import Section from "./components/Section";
import Badge from "./components/Badge";
import WOView from "./components/WOView";

import { demoRows } from "./lib/data";
import { normalizeRow, groupRows } from "./lib/rows";
import { exportAllocationsToXLSX } from "./lib/xlsxExport";
import { useAllocations } from "./hooks/useAllocations";
import { readFirstSheet } from "./utils/xlsxIO";
import { naturalCompare } from "./lib/natural";

export default function App() {
  const [rawRows, setRawRows] = useState(demoRows);
  const [selectedWO, setSelectedWO] = useState("");
  const [tab, setTab] = useState("engineering"); // "engineering" | "accounting"

  const rows = useMemo(() => rawRows.map(normalizeRow), [rawRows]);
  const grouped = useMemo(() => groupRows(rows), [rows]);

  const {
    allocState, keyOf, getItemState, upsertAllocation, removeAllocation,
    setAssetId, setAssetMeta, setReelSpan, removeReelSpan, getReelSpan, listReels, lockWorkOrder, setCableMode
  } = useAllocations(grouped);

  const workOrders = useMemo(() => Array.from(grouped.keys()).sort(naturalCompare), [grouped]);
  const activeWO = selectedWO || workOrders[0] || "";
  

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = await readFirstSheet(file);
      setRawRows(json);
      setSelectedWO("");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to read file", err);
    }
  }

  function exportAllocations() {
    exportAllocationsToXLSX({
      workOrders,
      grouped,
      getItemState,
      keyOf,
      allocState,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Failed to export allocations", err);
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div data-testid="app-shell" className="max-w-screen-2xl mx-auto">        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package2 className="w-7 h-7" /> Work Order Material Allocation – Sample App
          </h1>
          <p className="text-gray-600 mt-1">
            Upload your <em>Sales Order (sale.order)</em> export, review posted vs. returned quantities, allocate materials (including cable reels), and hand off to accounting for Asset IDs.
          </p>
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
            <div className="space-y-3">
              {/* Work Order select: full width */}
              <div>
                <div className="font-medium mb-1">Work Order</div>
                <select
                  className="w-full border rounded-xl p-2"
                  value={activeWO}
                  onChange={(e) => setSelectedWO(e.target.value)}
                >
                  {workOrders.length === 0 && <option value="">No work orders</option>}
                  {workOrders.map((wo) => (<option key={wo} value={wo}>{wo}</option>))}
                </select>
              </div>

              {/* Mode (segmented control) */}
              <div className="space-y-1" aria-label="Mode">
                <div className="text-sm text-slate-600">Mode</div>
                <div className="bg-slate-100 rounded-xl p-1">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setTab("engineering")}
                      aria-pressed={tab === "engineering"}
                      className={[
                        "w-full px-3 py-2 rounded-lg transition",
                        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900",
                        tab === "engineering"
                          ? "bg-white text-slate-900 font-semibold border border-blue-600 ring-2 ring-blue-600/75"
                          : "bg-white text-slate-700 hover:bg-white/80 border border-slate-200"
                      ].join(" ")}
                    >
                      Engineer
                    </button>

                    <button
                      type="button"
                      onClick={() => setTab("accounting")}
                      aria-pressed={tab === "accounting"}
                      className={[
                        "w-full px-3 py-2 rounded-lg transition",
                        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900",
                        tab === "accounting"
                          ? "bg-white text-slate-900 font-semibold border border-blue-600 ring-2 ring-blue-600/75"
                          : "bg-white text-slate-700 hover:bg-white/80 border border-slate-200"
                      ].join(" ")}
                    >
                      Accountant
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {activeWO ? (
          <>
            <Section title={`Materials for WO ${activeWO}`} icon={Split}>
            <WOView
              wo={activeWO}
              grouped={grouped}
              getItemState={getItemState}
              upsertAllocation={upsertAllocation}
              removeAllocation={removeAllocation}
              setAssetId={setAssetId}
              setAssetMeta={setAssetMeta}
              setReelSpan={setReelSpan}
              removeReelSpan={removeReelSpan}
              getReelSpan={getReelSpan}
              listReels={listReels}
              lockWorkOrder={lockWorkOrder}
              setCableMode={setCableMode}
                tab={tab}
                allocState={allocState}
              />
            </Section>

            <div className="flex items-center gap-2">
              <button onClick={exportAllocations} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gray-900 text-white">
                <Download className="w-4 h-4" /> Export allocations
              </button>
              <Badge>Posted/Returned derived from delivery quantities (returns = negative qty or lines containing "Return").</Badge>
            </div>
          </>
        ) : (
          <div className="text-gray-600">No work orders found in the file.</div>
        )}
      </div>
    </div>
  );
}
