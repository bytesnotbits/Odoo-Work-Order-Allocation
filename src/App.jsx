import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileUp, Package2, Split, Download } from "lucide-react";

import Section from "./components/Section";
import Badge from "./components/Badge";
import WOView from "./components/WOView";

import { demoRows, MISC_PRODUCT_CODE, MISC_PRODUCT_DESC, MISC_PRODUCT_PREFIX } from "./lib/data";
import { normalizeRow, groupRows } from "./lib/rows";
import { exportAllocationsToXLSX } from "./lib/xlsxExport";
import { useAllocations } from "./hooks/useAllocations";
import { readFirstSheet } from "./utils/xlsxIO";
import { buildStatePayload, downloadStateJson, readStateJson } from "./utils/stateIO";
import { loadPersistedState, savePersistedState } from "./utils/statePersistence";
import { naturalCompare } from "./lib/natural";

export default function App() {
  const [rawRows, setRawRows] = useState(demoRows);
  const [selectedWO, setSelectedWO] = useState("");
  const [tab, setTab] = useState("engineering"); // "engineering" | "accounting"
  const stateInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [localSnapshot, setLocalSnapshot] = useState(null);
  const [persistError, setPersistError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const initialSaveRef = useRef(true);

  const [miscEntries, setMiscEntries] = useState({});
  const [workOrderNotes, setWorkOrderNotes] = useState({});
  const rows = useMemo(() => rawRows.map(normalizeRow), [rawRows]);
  const grouped = useMemo(() => groupRows(rows), [rows]);
  const groupedWithMisc = useMemo(() => {
    const map = new Map();
    for (const [wo, gm] of grouped.entries()) {
      const clone = new Map(gm);
      const extras = miscEntries[wo] || [];
      extras.forEach(({ code, desc }) => {
        if (!clone.has(code)) {
          clone.set(code, {
            code,
            desc: desc || `${MISC_PRODUCT_DESC} (${code})`,
            posted: 0,
            returned: 0,
            isCable: false,
            group: "",
          });
        }
      });
      map.set(wo, clone);
    }
    return map;
  }, [grouped, miscEntries]);

  const normalizeMiscItemNumber = (raw) => {
    if (!raw) return "";
    const candidate = String(raw).trim().toUpperCase();
    if (!candidate) return "";
    if (candidate.startsWith(MISC_PRODUCT_PREFIX)) return candidate;
    return `${MISC_PRODUCT_PREFIX}${candidate}`;
  };

  const safeAlert = (msg) => {
    try {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(msg);
      }
    } catch {
      /* no-op in test or unsupported environments */
    }
  };

  const normalizeRecord = (value) => (value && typeof value === "object" ? value : {});

  const filenameTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

  const handleExportState = () => {
    const workOrderIdentifier = selectedWO || workOrders[0] || "";
    const prefix = workOrderIdentifier ? `${workOrderIdentifier}-allocation` : "allocation";
    const timestamp = filenameTimestamp();
    const payload = buildStatePayload({
      rawRows,
      miscEntries,
      workOrderNotes,
      allocState,
      selectedWO,
      tab,
    });
    const filename = `${prefix}-${timestamp}.json`;
    downloadStateJson(payload, filename);
    setLastBackup({ filename, timestamp: new Date() });
    setHasUnsavedChanges(false);
  };

  const handleStateImport = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const imported = await readStateJson(file);
      if (!imported || imported.schemaVersion !== 1) {
        throw new Error("Unsupported state file");
      }
      setRawRows(Array.isArray(imported.rawRows) ? imported.rawRows : demoRows);
      setMiscEntries(normalizeRecord(imported.miscEntries));
      setWorkOrderNotes(normalizeRecord(imported.workOrderNotes));
      setAllocState(normalizeRecord(imported.allocState));
      setSelectedWO(typeof imported.selectedWO === "string" ? imported.selectedWO : "");
      setTab(imported.tab === "accounting" ? "accounting" : "engineering");
    } catch (err) {
      console.error("Failed to import JSON state", err);
      safeAlert(`Failed to import JSON state: ${err?.message ?? err}`);
    } finally {
      if (event.target) event.target.value = "";
    }
  };

  const registerMiscEntry = (wo, itemNumber, description) => {
    if (!wo) return;
    const code = normalizeMiscItemNumber(itemNumber);
    if (!code) {
      safeAlert("Enter an item number such as MISC-1 before adding miscellaneous material.");
      return;
    }
    setMiscEntries((prev) => {
      const existing = prev[wo] || [];
      if (existing.some((entry) => entry.code === code)) {
        safeAlert(`${code} already exists on WO ${wo}.`);
        return prev;
      }
      const label = (description?.trim()) || `${MISC_PRODUCT_DESC} (${code})`;
      return {
        ...prev,
        [wo]: [...existing, { code, desc: label }],
      };
    });
  };

  const removeMiscEntry = (wo, rawCode) => {
    if (!wo) return;
    const code = normalizeMiscItemNumber(rawCode);
    if (!code) return;
    setMiscEntries((prev) => {
      const existing = prev[wo] || [];
      const updated = existing.filter((entry) => entry.code !== code);
      if (updated.length === existing.length) return prev;
      if (updated.length === 0) {
        const { [wo]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [wo]: updated };
    });
  };

  const updateWorkOrderNote = (wo, note) => {
    if (!wo) return;
    setWorkOrderNotes((prev) => {
      if (!note) {
        const { [wo]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [wo]: note };
    });
  };

  const {
    allocState,
    setAllocState,
    keyOf,
    getItemState,
    upsertAllocation,
    removeAllocation,
    setAssetMeta,
    setReelSpan,
    removeReelSpan,
    getReelSpan,
    listReels,
    lockWorkOrder,
    setCableMode,
    addReelAllocation,
    updateAllocation,
  } = useAllocations(groupedWithMisc);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const snapshot = await loadPersistedState();
        if (canceled) return;
        if (snapshot?.payload) {
          setRawRows(
            Array.isArray(snapshot.payload.rawRows) ? snapshot.payload.rawRows : demoRows
          );
          setMiscEntries(normalizeRecord(snapshot.payload.miscEntries));
          setWorkOrderNotes(normalizeRecord(snapshot.payload.workOrderNotes));
          setAllocState(normalizeRecord(snapshot.payload.allocState));
          setSelectedWO(
            typeof snapshot.payload.selectedWO === "string" ? snapshot.payload.selectedWO : ""
          );
          setTab(snapshot.payload.tab === "accounting" ? "accounting" : "engineering");
        }
        if (snapshot?.savedAt) {
          setLocalSnapshot({ savedAt: snapshot.savedAt, source: snapshot.source });
        }
      } catch (err) {
        console.error("Failed to load persisted state", err);
      } finally {
        if (!canceled) {
          setIsHydrated(true);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [setAllocState]);

  useEffect(() => {
    if (!isHydrated) return undefined;
    let canceled = false;
    const payload = buildStatePayload({
      rawRows,
      miscEntries,
      workOrderNotes,
      allocState,
      selectedWO,
      tab,
    });

    (async () => {
      try {
        const meta = await savePersistedState(payload);
        if (canceled) return;
        if (meta) {
          setLocalSnapshot({ savedAt: meta.savedAt, source: meta.source });
          setPersistError("");
        } else {
          setPersistError("Local persistence is unavailable in this browser.");
        }
      } catch (err) {
        if (canceled) return;
        console.error("Failed to persist state", err);
        setPersistError(err?.message || "Unable to save data locally.");
      }
    })();

    if (initialSaveRef.current) {
      initialSaveRef.current = false;
    } else {
      setHasUnsavedChanges(true);
    }

    return () => {
      canceled = true;
    };
  }, [rawRows, miscEntries, workOrderNotes, allocState, selectedWO, tab, isHydrated]);

  const workOrders = useMemo(() => Array.from(grouped.keys()).sort(naturalCompare), [grouped]);
  const activeWO = selectedWO || workOrders[0] || "";
  const miscEntriesForActive = miscEntries[activeWO] || [];
  const nextMiscCode = `${MISC_PRODUCT_PREFIX}${miscEntriesForActive.length + 1}`;
  const noteForActive = workOrderNotes[activeWO] || "";

  const formatTimestamp = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const snapshotSourceLabel = localSnapshot?.source === "indexedDB" ? "IndexedDB" : "browser storage";
  

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = await readFirstSheet(file);
      setRawRows(json);
      setSelectedWO("");
      setMiscEntries({});
      setWorkOrderNotes({});
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to read file", err);
    }
  }

  function exportAllocations() {
    const workOrderIdentifier = selectedWO || workOrders[0] || "";
    const prefix = workOrderIdentifier ? `${workOrderIdentifier}-allocation` : "allocation";
    const filename = `${prefix}-${filenameTimestamp()}.xlsx`;
    exportAllocationsToXLSX(
      {
        workOrders,
        grouped: groupedWithMisc,
        getItemState,
        keyOf,
        allocState,
      },
      { filename },
    ).catch((err) => {
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

        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs">
          <div
            className={`px-2 py-1 rounded-full border ${
              hasUnsavedChanges
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {hasUnsavedChanges ? "Unsaved changes" : "All changes backed up"}
          </div>
          <div className="text-slate-600 whitespace-nowrap">
            {localSnapshot
              ? `Local snapshot (${snapshotSourceLabel}) saved ${formatTimestamp(localSnapshot.savedAt)}`
              : "Waiting for local snapshot..."}
          </div>
          {lastBackup && (
            <div className="text-slate-600 whitespace-nowrap">
              Last export: {lastBackup.filename} @ {formatTimestamp(lastBackup.timestamp)}
            </div>
          )}
          {persistError && (
            <div className="px-2 py-1 rounded-full border border-red-100 bg-red-50 text-red-600">
              {persistError}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 bg-white rounded-2xl shadow p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <FileUp className="w-5 h-5" />
              <div>
                <div className="font-medium">Upload file</div>
                <div className="text-sm text-gray-600">XLSX/CSV with columns like: WORK ORDER, Order Lines, Order Lines/Delivery Quantity</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input
                ref={csvInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
              />
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-2xl border border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                onClick={() => csvInputRef.current?.click()}
              >
                Choose spreadsheet
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input
                ref={stateInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleStateImport}
                className="hidden"
              />
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-2xl border border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                onClick={() => stateInputRef.current?.click()}
              >
                Import JSON state
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-2xl bg-gray-900 text-white hover:bg-gray-800"
                onClick={handleExportState}
              >
                Export JSON state
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">No file? Using demo data.</div>
            <div className="text-xs text-gray-500 mt-1">
              JSON state captures allocations, reels, asset metadata, misc entries, and notes so nothing is lost.
            </div>
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
                grouped={groupedWithMisc}
                baseGrouped={grouped}
                getItemState={getItemState}
                upsertAllocation={upsertAllocation}
                removeAllocation={removeAllocation}
                setAssetMeta={setAssetMeta}
                setReelSpan={setReelSpan}
                removeReelSpan={removeReelSpan}
                getReelSpan={getReelSpan}
                listReels={listReels}
                lockWorkOrder={lockWorkOrder}
                setCableMode={setCableMode}
                addReelAllocation={addReelAllocation}
                updateAllocation={updateAllocation}
                tab={tab}
                allocState={allocState}
                addMiscEntry={(itemNumber, description) => registerMiscEntry(activeWO, itemNumber, description)} // ensures function bound to current work order
                removeMiscEntry={(code) => removeMiscEntry(activeWO, code)}
                nextMiscCode={nextMiscCode}
                workOrderNote={noteForActive}
                onWorkOrderNoteChange={(note) => updateWorkOrderNote(activeWO, note)}
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
