import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { WORK_ORDER_HISTORY_STATUSES } from "./utils/workOrderHistory";
import { useWorkOrderHistory } from "./hooks/useWorkOrderHistory";
import { naturalCompare } from "./lib/natural";

const HISTORY_STATUS_FILTERS = [
  { value: "all", label: "All" },
  ...WORK_ORDER_HISTORY_STATUSES,
];
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
  const [historyFilter, setHistoryFilter] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");

  const [miscEntries, setMiscEntries] = useState({});
  const [workOrderNotes, setWorkOrderNotes] = useState({});
  const lastSavedPayloadRef = useRef(null);
  const rows = useMemo(() => rawRows.map(normalizeRow), [rawRows]);
  const grouped = useMemo(() => groupRows(rows), [rows]);
  const workOrderDescriptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (!row.workOrder) continue;
      const desc = row.workOrderDescription;
      if (!desc || map.has(row.workOrder)) continue;
      map.set(row.workOrder, desc);
    }
    return map;
  }, [rows]);
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

  const {
    entries: workOrderHistory,
    upsertEntry: upsertHistoryEntry,
    removeEntry: removeHistoryEntry,
    clearHistory,
    setEntryStatus,
  } = useWorkOrderHistory();

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

  const setBaselinePayload = (payload) => {
    lastSavedPayloadRef.current = JSON.stringify(payload);
    setHasUnsavedChanges(false);
  };

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
    setBaselinePayload(payload);
  };

  const handleStateImport = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const imported = await readStateJson(file);
      if (!imported || imported.schemaVersion !== 1) {
        throw new Error("Unsupported state file");
      }
      applyPayload(imported);
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
          const normalizedRows = Array.isArray(snapshot.payload.rawRows)
            ? snapshot.payload.rawRows
            : demoRows;
          const normalizedMisc = normalizeRecord(snapshot.payload.miscEntries);
          const normalizedNotes = normalizeRecord(snapshot.payload.workOrderNotes);
          const normalizedAlloc = normalizeRecord(snapshot.payload.allocState);
          const normalizedSelectedWO =
            typeof snapshot.payload.selectedWO === "string" ? snapshot.payload.selectedWO : "";
          const normalizedTab =
            snapshot.payload.tab === "accounting" ? "accounting" : "engineering";
          setRawRows(normalizedRows);
          setMiscEntries(normalizedMisc);
          setWorkOrderNotes(normalizedNotes);
          setAllocState(normalizedAlloc);
          setSelectedWO(normalizedSelectedWO);
          setTab(normalizedTab);
          setBaselinePayload(
            buildStatePayload({
              rawRows: normalizedRows,
              miscEntries: normalizedMisc,
              workOrderNotes: normalizedNotes,
              allocState: normalizedAlloc,
              selectedWO: normalizedSelectedWO,
              tab: normalizedTab,
            }),
          );
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

  const applyPayload = (payload) => {
    if (!payload) return;
    const normalizedRows = Array.isArray(payload.rawRows) ? payload.rawRows : demoRows;
    const normalizedMisc = normalizeRecord(payload.miscEntries);
    const normalizedNotes = normalizeRecord(payload.workOrderNotes);
    const normalizedAlloc = normalizeRecord(payload.allocState);
    const normalizedSelectedWO =
      typeof payload.selectedWO === "string" ? payload.selectedWO : "";
    const normalizedTab = payload.tab === "accounting" ? "accounting" : "engineering";
    setRawRows(normalizedRows);
    setMiscEntries(normalizedMisc);
    setWorkOrderNotes(normalizedNotes);
    setAllocState(normalizedAlloc);
    setSelectedWO(normalizedSelectedWO);
    setTab(normalizedTab);
    setBaselinePayload(
      buildStatePayload({
        rawRows: normalizedRows,
        miscEntries: normalizedMisc,
        workOrderNotes: normalizedNotes,
        allocState: normalizedAlloc,
        selectedWO: normalizedSelectedWO,
        tab: normalizedTab,
      }),
    );
  };

  const buildWorkOrderSnapshot = useCallback(
    (woId) => {
      if (!woId) return null;
      const filteredRows = [];
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i]?.workOrder === woId) {
          filteredRows.push(rawRows[i]);
        }
      }
      const miscForWO = {};
      if (Array.isArray(miscEntries[woId]) && miscEntries[woId].length > 0) {
        miscForWO[woId] = miscEntries[woId];
      }
      const noteForWO = workOrderNotes[woId];
      const notesForWO = noteForWO ? { [woId]: noteForWO } : {};
      const prefix = `${woId}|`;
      const allocForWO = Object.entries(allocState).reduce((acc, [key, value]) => {
        if (key.startsWith(prefix)) {
          acc[key] = value;
        }
        return acc;
      }, {});
      return buildStatePayload({
        rawRows: filteredRows,
        miscEntries: miscForWO,
        workOrderNotes: notesForWO,
        allocState: allocForWO,
        selectedWO: woId,
        tab,
      });
    },
    [allocState, miscEntries, rawRows, rows, tab, workOrderNotes],
  );

  const handleHistoryEntryLoad = (entry) => {
    if (!entry?.id) return;
    if (entry.snapshot) {
      applyPayload(entry.snapshot);
    } else {
      const fallback = buildWorkOrderSnapshot(entry.id);
      if (fallback) {
        applyPayload(fallback);
      }
    }
    setSelectedWO(entry.id);
  };

  const handleHistoryEntryExport = (entry) => {
    if (!entry?.id) return;
    const payload = entry.snapshot || buildWorkOrderSnapshot(entry.id);
    if (!payload) return;
    const filename = `${entry.id}-history-${filenameTimestamp()}.json`;
    downloadStateJson(payload, filename);
    setLastBackup({ filename, timestamp: new Date() });
  };

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
    const payloadString = JSON.stringify(payload);

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
      setHasUnsavedChanges(false);
    } else if (lastSavedPayloadRef.current === null) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(lastSavedPayloadRef.current !== payloadString);
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
  const activeWODescription = workOrderDescriptions.get(activeWO) || "";

  const normalizedHistoryFilter = historyFilter.trim().toLowerCase();
  const filteredHistory = useMemo(() => {
    return workOrderHistory.filter((entry) => {
      if (!entry) return false;
      const haystack = `${entry.id} ${entry.description || ""}`.toLowerCase();
      const matchesTerm = normalizedHistoryFilter ? haystack.includes(normalizedHistoryFilter) : true;
      const matchesStatus =
        historyStatusFilter === "all" ? true : entry.status === historyStatusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [historyStatusFilter, normalizedHistoryFilter, workOrderHistory]);
  useEffect(() => {
    if (!isHydrated || !activeWO) return;
    const payload = buildWorkOrderSnapshot(activeWO);
    if (!payload) return;
    upsertHistoryEntry({
      id: activeWO,
      description: activeWODescription,
      lastOpened: new Date().toISOString(),
      snapshot: payload,
    });
  }, [activeWO, activeWODescription, buildWorkOrderSnapshot, isHydrated, upsertHistoryEntry]);

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
      setBaselinePayload(
        buildStatePayload({
          rawRows: json,
          miscEntries: {},
          workOrderNotes: {},
          allocState,
          selectedWO: "",
          tab,
        }),
      );
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
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">Work order history</div>
                    <div className="text-xs text-slate-500">
                      Search, load, export, or remove any work order you have opened.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={workOrderHistory.length === 0}
                    onClick={clearHistory}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 disabled:opacity-40"
                  >
                    Clear history
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search by work order or description"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:ring-0"
                    value={historyFilter}
                    onChange={(event) => setHistoryFilter(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 text-xs">
                    {HISTORY_STATUS_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => setHistoryStatusFilter(filter.value)}
                        className={[
                          "rounded-full border px-3 py-1 font-medium transition",
                          historyStatusFilter === filter.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-[6rem] space-y-2 overflow-y-auto pr-2">
                    {filteredHistory.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        {workOrderHistory.length === 0
                          ? "Load a work order and open it to start a history."
                          : "No matching work orders found."}
                      </div>
                    ) : (
                      filteredHistory.map((entry) => {
                        const statusDefinition = WORK_ORDER_HISTORY_STATUSES.find(
                          (statusOption) => statusOption.value === entry.status,
                        );
                        const statusLabel = statusDefinition?.label || entry.status;
                        return (
                          <div
                            key={entry.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => handleHistoryEntryLoad(entry)}
                                className="flex-1 text-left text-sm font-semibold text-slate-900 hover:underline"
                              >
                                {entry.id}
                              </button>
                              <span className="text-xs font-semibold text-slate-500">
                                {statusLabel}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {entry.description || "No description available"} · Last opened{" "}
                              {formatTimestamp(entry.lastOpened)}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                value={entry.status}
                                onChange={(event) => setEntryStatus(entry.id, event.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs focus:border-slate-900"
                              >
                                {WORK_ORDER_HISTORY_STATUSES.map((statusOption) => (
                                  <option key={statusOption.value} value={statusOption.value}>
                                    {statusOption.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleHistoryEntryExport(entry)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                              >
                                Export
                              </button>
                              <button
                                type="button"
                                onClick={() => removeHistoryEntry(entry.id)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 hover:border-rose-300"
                              >
                                Purge
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
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
                          : "bg-white text-slate-700 hover:bg-white/80 border border-slate-200",
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
                          : "bg-white text-slate-700 hover:bg-white/80 border border-slate-200",
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
            <Section title={`Materials for WO ${activeWO}`} subtitle={activeWODescription} icon={Split}>
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
