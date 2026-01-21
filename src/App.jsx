import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileUp, Package2, Split, Download } from "lucide-react";

import Section from "./components/Section";
import Badge from "./components/Badge";
import WOView from "./components/WOView";
import CableReelChargeoutPrototype from "./components/CableReelChargeoutPrototype";

import { MISC_PRODUCT_CODE, MISC_PRODUCT_DESC, MISC_PRODUCT_PREFIX } from "./lib/data";
import {
  normalizeRow,
  groupRows,
  normalizeWorkOrderStatus,
  mapWorkOrderStatusToHistoryStatus,
} from "./lib/rows";
import { exportAllocationsToXLSX } from "./lib/xlsxExport";
import { useAllocations } from "./hooks/useAllocations";
import { readFirstSheet } from "./utils/xlsxIO";
import { buildStatePayload, downloadStateJson, readStateJson } from "./utils/stateIO";
import { loadPersistedState, savePersistedState } from "./utils/statePersistence";
import { WORK_ORDER_HISTORY_STATUSES } from "./utils/workOrderHistory";
import { useWorkOrderHistory } from "./hooks/useWorkOrderHistory";
import { useAuditTrail } from "./hooks/useAuditTrail";
import { naturalCompare } from "./lib/natural";
import { loadUserIdentity, persistUserIdentity } from "./utils/identityStorage";
import packageJson from "../package.json";
import "./App.css";

const APP_VERSION = packageJson.version;

const TAB_OPTIONS = [
  { value: "engineering", label: "Engineer" },
  { value: "accounting", label: "Accountant" },
  { value: "chargeout", label: "Material Charge-out" },
];
const DEFAULT_TAB = "engineering";
const HISTORY_STATUS_FILTERS = [
  { value: "all", label: "All" },
  ...WORK_ORDER_HISTORY_STATUSES,
];
const DROPDOWN_SUGGESTION_LIMIT = 6;
const isValidTab = (value) => TAB_OPTIONS.some((option) => option.value === value);
export default function App() {
  const [rawRows, setRawRows] = useState([]);
  const [selectedWO, setSelectedWO] = useState("");
  const [tab, setTab] = useState(DEFAULT_TAB); // "engineering" | "accounting" | "chargeout"
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allowImplicitSelection, setAllowImplicitSelection] = useState(true);
  const searchWrapperRef = useRef(null);
  const [userIdentity, setUserIdentity] = useState(() => loadUserIdentity());
  const lastViewedWorkOrderRef = useRef("");
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  useEffect(() => {
    const handleClick = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    persistUserIdentity(userIdentity);
  }, [userIdentity]);

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
  const workOrderImportStatuses = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (!row?.workOrder) continue;
      const label = normalizeWorkOrderStatus(row.status);
      if (!label) continue;
      const historyStatus = mapWorkOrderStatusToHistoryStatus(label);
      if (!historyStatus) continue;
      const existing = map.get(row.workOrder);
      if (historyStatus === "closed") {
        map.set(row.workOrder, { label, historyStatus });
      } else if (!existing) {
        map.set(row.workOrder, { label, historyStatus });
      }
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
    setEntryStatus,
  } = useWorkOrderHistory();
  const { entries: auditEntries, recordAuditEvent } = useAuditTrail();
  const workOrderHistoryRef = useRef(workOrderHistory);
  useEffect(() => {
    workOrderHistoryRef.current = workOrderHistory;
  }, [workOrderHistory]);

  const userDisplayName = userIdentity.name || userIdentity.email || "Unknown user";
  const isIdentityComplete =
    Boolean(userIdentity.name?.trim()) && Boolean(userIdentity.email?.trim());
  const lockedContentClassName = isIdentityComplete ? "" : "pointer-events-none opacity-60";

  const logAuditEvent = useCallback(
    (workOrderId, action, details = "") => {
      if (!workOrderId || !action) return;
      recordAuditEvent({
        workOrderId,
        action,
        details,
        modifiedBy: userDisplayName,
      });
    },
    [recordAuditEvent, userDisplayName],
  );

  const describeAllocationPayload = useCallback(
    (wo, code, payload) => {
      if (!payload) return "";
      const typeLabel = payload.type === "reel" ? "Reel piece" : "Quantity allocation";
      const amount =
        payload.type === "reel"
          ? payload.footage ?? `${payload.outer ?? ""}-${payload.inner ?? ""}`
          : payload.qty;
      let description = `${typeLabel} ${amount ?? ""}`.trim();
      if (payload.reelSerial) description += ` on ${payload.reelSerial}`;
      if (payload.allocationCategory) description += ` as ${payload.allocationCategory}`;
      const product = groupedWithMisc.get(wo)?.get(code);
      const itemNumber = product?.code || code;
      const itemDesc = product?.desc ? ` ${product.desc}` : "";
      const label = `[${itemNumber}]${itemDesc}`;
      return `${label} — ${description}`.trim();
    },
    [groupedWithMisc],
  );

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

  const parseTimestampValue = (value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleIdentityChange = (field, value) => {
    setUserIdentity((prev) => ({ ...prev, [field]: String(value || "") }));
  };
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
    getReelSpanMap,
    getReelChargeout,
    setReelChargeout,
    listReelSpans,
    setCableMode,
    addReelAllocation,
    updateAllocation,
    resetItem,
  } = useAllocations(groupedWithMisc);

  const handleUpsertAllocation = useCallback(
    (wo, code, payload, assetMeta) => {
      if (!wo || !payload) return undefined;
      const allocId = upsertAllocation(wo, code, payload, assetMeta);
      const detail = describeAllocationPayload(wo, code, payload);
      logAuditEvent(wo, "Recorded allocation", detail);
      return allocId;
    },
    [upsertAllocation, describeAllocationPayload, logAuditEvent],
  );

  const handleUpdateAllocation = useCallback(
    (wo, code, allocId, payload) => {
      updateAllocation(wo, code, allocId, payload);
      if (!wo || !allocId) return;
      if (!payload || typeof payload !== "object") {
        logAuditEvent(wo, "Updated allocation", `Allocation ${allocId} updated`);
        return;
      }
      const prevAlloc =
        allocState?.[`${wo}|${code}`]?.allocations?.find((alloc) => alloc.id === allocId) || null;
      const hasStatusChange =
        Object.prototype.hasOwnProperty.call(payload, "chargeoutStatus") &&
        payload.chargeoutStatus !== prevAlloc?.chargeoutStatus;
      const prevJournalEntry = prevAlloc?.chargeoutJournalEntry || "";
      const hasJournalEntryChange =
        Object.prototype.hasOwnProperty.call(payload, "chargeoutJournalEntry") &&
        payload.chargeoutJournalEntry !== prevJournalEntry;
      const hasChargeoutFlagChange =
        Object.prototype.hasOwnProperty.call(payload, "chargeoutSelected") &&
        payload.chargeoutSelected !== prevAlloc?.chargeoutSelected;
      const allocationLabel = prevAlloc
        ? describeAllocationPayload(wo, code, prevAlloc)
        : `Allocation ${allocId}`;
      if (hasStatusChange) {
        const prevStatus = prevAlloc?.chargeoutStatus || (prevAlloc?.chargeoutSelected ? "Pending Charge" : "None");
        const nextStatus = payload.chargeoutStatus || (payload.chargeoutSelected ? "Pending Charge" : "None");
        const journalSuffix =
          hasJournalEntryChange && payload.chargeoutJournalEntry
            ? ` · JE ${payload.chargeoutJournalEntry}`
            : "";
        logAuditEvent(
          wo,
          "Charge-out status updated",
          `${allocationLabel} — ${prevStatus} → ${nextStatus}${journalSuffix}`,
        );
      }
      if (hasJournalEntryChange && !hasStatusChange) {
        const journalLabel = payload.chargeoutJournalEntry
          ? `JE ${payload.chargeoutJournalEntry}`
          : "JE cleared";
        logAuditEvent(wo, "Charge-out journal entry updated", `${allocationLabel} — ${journalLabel}`);
      }
      if (hasChargeoutFlagChange && !hasStatusChange) {
        const flagLabel = payload.chargeoutSelected ? "Flagged for charge-out" : "Charge-out flag cleared";
        logAuditEvent(wo, "Charge-out flag updated", `${allocationLabel} — ${flagLabel}`);
      }
      if (!hasStatusChange && !hasJournalEntryChange && !hasChargeoutFlagChange) {
        logAuditEvent(wo, "Updated allocation", `Allocation ${allocId} updated`);
      }
    },
    [updateAllocation, logAuditEvent, allocState, describeAllocationPayload],
  );

  const handleRemoveAllocation = useCallback(
    (wo, code, id) => {
      removeAllocation(wo, code, id);
      if (!wo || !id) return;
      logAuditEvent(wo, "Removed allocation", `Allocation ${id} removed`);
    },
    [logAuditEvent, removeAllocation],
  );

  const handleAddReelAllocation = useCallback(
    (wo, code, payload, options) => {
      const result = addReelAllocation?.(wo, code, payload, options);
      if (result && !result.error) {
        logAuditEvent(wo, "Recorded allocation", describeAllocationPayload(wo, code, payload));
      }
      return result;
    },
    [addReelAllocation, describeAllocationPayload, logAuditEvent],
  );

  const handleSetAssetMeta = useCallback(
    (wo, code, allocId, fields) => {
      setAssetMeta(wo, code, allocId, fields);
      if (!wo || !allocId || !fields) return;
      const changedFields = Object.keys(fields).filter((key) => {
        const value = fields[key];
        return value !== null && value !== undefined && value !== "";
      });
      if (changedFields.length === 0) return;
      logAuditEvent(
        wo,
        "Captured asset metadata",
        `Updated ${changedFields.join(", ")} for allocation ${allocId}`,
      );
    },
    [setAssetMeta, logAuditEvent],
  );

  const handleSetReelSpan = useCallback(
    (wo, code, serial, start, end, options) => {
      const savedSpan = setReelSpan(wo, code, serial, start, end, options);
      if (savedSpan) {
        logAuditEvent(
          wo,
          "Saved reel span",
          `Span [${savedSpan.start}–${savedSpan.end}] on ${serial}`,
        );
      }
      return savedSpan;
    },
    [setReelSpan, logAuditEvent],
  );

  const handleRemoveReelSpan = useCallback(
    (wo, code, serial) => {
      removeReelSpan(wo, code, serial);
      if (!wo || !serial) return;
      logAuditEvent(wo, "Removed reel span", `Span removed for ${serial}`);
    },
    [removeReelSpan, logAuditEvent],
  );

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const snapshot = await loadPersistedState();
        if (canceled) return;
        if (snapshot?.payload) {
          const normalizedRows = Array.isArray(snapshot.payload.rawRows)
            ? snapshot.payload.rawRows
            : [];
          const normalizedMisc = normalizeRecord(snapshot.payload.miscEntries);
          const normalizedNotes = normalizeRecord(snapshot.payload.workOrderNotes);
          const normalizedAlloc = normalizeRecord(snapshot.payload.allocState);
          const normalizedSelectedWO =
            typeof snapshot.payload.selectedWO === "string" ? snapshot.payload.selectedWO : "";
          const normalizedTab = isValidTab(snapshot.payload.tab)
            ? snapshot.payload.tab
            : DEFAULT_TAB;
          setRawRows(normalizedRows);
          setMiscEntries(normalizedMisc);
          setWorkOrderNotes(normalizedNotes);
          setAllocState(normalizedAlloc);
          setSelectedWO(normalizedSelectedWO);
          setAllowImplicitSelection(true);
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
    const normalizedRows = Array.isArray(payload.rawRows) ? payload.rawRows : [];
    const normalizedMisc = normalizeRecord(payload.miscEntries);
    const normalizedNotes = normalizeRecord(payload.workOrderNotes);
    const normalizedAlloc = normalizeRecord(payload.allocState);
    const normalizedSelectedWO =
      typeof payload.selectedWO === "string" ? payload.selectedWO : "";
    const normalizedTab = isValidTab(payload.tab) ? payload.tab : DEFAULT_TAB;
    setRawRows(normalizedRows);
    setMiscEntries(normalizedMisc);
    setWorkOrderNotes(normalizedNotes);
    setAllocState(normalizedAlloc);
    setSelectedWO(normalizedSelectedWO);
    setAllowImplicitSelection(true);
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
    setAllowImplicitSelection(true);
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
  const fallbackWO = allowImplicitSelection ? workOrders[0] || "" : "";
  const activeWO = selectedWO || fallbackWO;
  const miscEntriesForActive = miscEntries[activeWO] || [];
  const nextMiscCode = `${MISC_PRODUCT_PREFIX}${miscEntriesForActive.length + 1}`;
  const noteForActive = workOrderNotes[activeWO] || "";
  const activeWODescription = workOrderDescriptions.get(activeWO) || "";

  const isHistoryStatusLocked = useCallback(
    (entryId) => {
      if (!entryId) return false;
      return workOrderImportStatuses.get(entryId)?.historyStatus === "closed";
    },
    [workOrderImportStatuses],
  );

  const handleHistoryStatusChange = useCallback(
    (entry, status) => {
      if (!entry || !status) return;
      if (isHistoryStatusLocked(entry.id)) return;
      setEntryStatus(entry.id, status, userDisplayName);
      recordAuditEvent({
        workOrderId: entry.id,
        action: "Updated work order status",
        details: `Status changed to ${status}`,
        modifiedBy: userDisplayName,
      });
    },
    [isHistoryStatusLocked, recordAuditEvent, setEntryStatus, userDisplayName],
  );

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

  const featuredHistoryEntry =
    workOrderHistory.find((entry) => entry.id === activeWO) || filteredHistory[0] || null;
  const otherHistoryEntries = filteredHistory.filter(
    (entry) => entry.id !== featuredHistoryEntry?.id,
  );
  const featuredHistoryStatusLocked = featuredHistoryEntry
    ? isHistoryStatusLocked(featuredHistoryEntry.id)
    : false;
  const dropdownSuggestions = otherHistoryEntries.slice(0, DROPDOWN_SUGGESTION_LIMIT);
  const auditEntriesForActive = useMemo(() => {
    if (!activeWO) return [];
    return auditEntries
      .filter((entry) => entry.workOrderId === activeWO)
      .sort(
        (a, b) =>
          parseTimestampValue(b.modifiedAt) - parseTimestampValue(a.modifiedAt),
      )
      .slice(0, 5);
  }, [activeWO, auditEntries]);
  useEffect(() => {
    if (!activeWO) {
      setShowAuditPanel(false);
    }
  }, [activeWO]);
  useEffect(() => {
    if (!isHydrated) return;
    if (!activeWO) {
      lastViewedWorkOrderRef.current = "";
      return;
    }
    const payload = buildWorkOrderSnapshot(activeWO);
    if (!payload) return;
    const importMetadata = workOrderImportStatuses.get(activeWO);
    const importedStatus = importMetadata?.historyStatus || "";
    const currentStatus = workOrderHistoryRef.current.find(
      (entry) => entry.id === activeWO,
    )?.status;
    const shouldApplyImportStatus =
      importedStatus && (importedStatus === "closed" || currentStatus !== "submitted");
    const historyEntry = {
      id: activeWO,
      description: activeWODescription,
      lastOpened: new Date().toISOString(),
      snapshot: payload,
      modifiedBy: userDisplayName,
    };
    if (shouldApplyImportStatus) {
      historyEntry.status = importedStatus;
    }
    upsertHistoryEntry(historyEntry);
    if (lastViewedWorkOrderRef.current !== activeWO) {
      recordAuditEvent({
        workOrderId: activeWO,
        action: "Viewed work order",
        details: activeWODescription || "Opened work order snapshot",
        modifiedBy: userDisplayName,
      });
      lastViewedWorkOrderRef.current = activeWO;
    }
  }, [
    activeWO,
    activeWODescription,
    buildWorkOrderSnapshot,
    isHydrated,
    upsertHistoryEntry,
    recordAuditEvent,
    workOrderImportStatuses,
    userDisplayName,
  ]);

  const handleItemReset = useCallback(
    (woId, code, description) => {
      if (!woId || !code) return;
      resetItem(woId, code);
      const detail = description ? `[${code}] ${description}` : `[${code}]`;
      logAuditEvent(woId, "Reset item", `Cleared allocations and asset data for ${detail}`);
    },
    [resetItem, logAuditEvent],
  );

  const formatTimestamp = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const snapshotSourceLabel = localSnapshot?.source === "indexedDB" ? "IndexedDB" : "browser storage";
  const HistoryEntryCard = ({ entry, highlight = false, disableStatusChanges = false }) => {
    const statusDefinition = WORK_ORDER_HISTORY_STATUSES.find(
      (statusOption) => statusOption.value === entry.status,
    );
    const statusLabel = statusDefinition?.label || entry.status;
    return (
      <div
        className={[
          "rounded-2xl border p-3",
          highlight
            ? "border-blue-300 bg-blue-50 shadow-inner"
            : "border-slate-200 bg-slate-50",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => handleHistoryEntryLoad(entry)}
            className="flex-1 text-left text-sm font-semibold text-slate-900 hover:underline"
          >
            {entry.id}
          </button>
          <span className="text-xs font-semibold text-slate-500">{statusLabel}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {entry.description || "No description available"} · Last opened{" "}
          {formatTimestamp(entry.lastOpened)}
        </div>
        {entry.modifiedBy && (
          <div className="mt-1 text-xs text-slate-500">Last modified by {entry.modifiedBy}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Status
          </span>
          <select
            value={entry.status}
            onChange={(event) => handleHistoryStatusChange(entry, event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs focus:border-slate-900"
            disabled={disableStatusChanges}
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
        </div>
      </div>
    );
  };


  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = await readFirstSheet(file);
      setRawRows(json);
      setSelectedWO("");
      setAllowImplicitSelection(true);
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

        <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">Current user (manual entry)</div>
              <div className="text-xs text-slate-500">
                Capture your name/email for audit trail testing until Azure AD (MSAL) is wired up.
              </div>
            </div>
            <span className="text-xs text-slate-500">Actor: {userDisplayName}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-500">
              Name
              <input
                name="user-name"
                type="text"
                value={userIdentity.name}
                placeholder="Engineer or accountant name"
                onChange={(event) => handleIdentityChange("name", event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:ring-0"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              Email
              <input
                name="user-email"
                type="email"
                value={userIdentity.email}
                placeholder="name@example.com"
                onChange={(event) => handleIdentityChange("email", event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-900 focus:ring-0"
              />
            </label>
          </div>
        </div>

        <div className="relative">
          {!isIdentityComplete && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white/90 px-6 py-12 text-center text-sm font-semibold text-rose-700 shadow-sm backdrop-blur-sm">
              <p>Please enter both your name and email above so we can track every action while MS Azure logins are pending.</p>
              <p className="text-xs text-rose-600">Identity capture unlocks the allocator until the Azure login flow is ready.</p>
            </div>
          )}
          <div className={lockedContentClassName}>
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

          </div>
        </div>

        <div className="grid gap-4 mb-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:grid-rows-[auto_auto]">
          <div className="bg-white rounded-2xl shadow p-4 border border-gray-100 md:col-start-1 md:row-start-1 md:row-end-2">
            <div className="flex items-center gap-3">
              <FileUp className="w-5 h-5" />
              <div>
                <div className="font-medium">Upload file</div>
                <div className="text-sm text-gray-600">XLSX/CSV with columns like: WORK ORDER, Order Lines, Order Lines/Delivery Quantity</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input
                name="work-order-spreadsheet"
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
                name="state-json"
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

          <div className="space-y-3 bg-white rounded-2xl shadow p-4 border border-gray-100 md:col-start-2 md:row-start-1 md:row-end-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">Work order history</div>
                <div className="text-xs text-slate-500">
                  Search, load, or export any work order you have opened.
                </div>
              </div>
            </div>

            <div className="space-y-2" ref={searchWrapperRef}>
              <div className="relative">
                <div className="bg-slate-100 rounded-xl border border-slate-200 p-1 shadow-sm">
                  <input
                    name="history-search"
                    type="text"
                    placeholder="Search by work order or description"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-slate-900 focus:outline-none"
                    value={historyFilter}
                    onFocus={() => setShowSuggestions(true)}
                    onChange={(event) => {
                      setHistoryFilter(event.target.value);
                      setShowSuggestions(true);
                    }}
                  />
                </div>
                {showSuggestions && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {dropdownSuggestions.length > 0 ? (
                      dropdownSuggestions.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            handleHistoryEntryLoad(entry);
                            setHistoryFilter("");
                            setShowSuggestions(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <div className="font-semibold text-slate-900">{entry.id}</div>
                          <div className="text-xs text-slate-500">
                            {entry.description || "No description available"}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        {historyFilter
                          ? `No work orders match "${historyFilter}".`
                          : "No other work orders available in your history yet."}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
            </div>

            <div className="space-y-3">
              {featuredHistoryEntry ? (
                <>
                  <div className="text-xs text-slate-500">Currently open work order</div>
                  <HistoryEntryCard
                    entry={featuredHistoryEntry}
                    highlight
                    disableStatusChanges={featuredHistoryStatusLocked}
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  Load a work order to populate your history.
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {otherHistoryEntries.length === 0
                  ? "No other work orders match the current filters."
                  : `${otherHistoryEntries.length} other work order${otherHistoryEntries.length === 1 ? "" : "s"} available via search.`}
              </div>
              <button
                type="button"
                onClick={() => setShowAuditPanel(true)}
                disabled={!activeWO}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-40"
              >
                View audit trail
              </button>
            </div>

            {/* Mode (segmented control) */}
            <div className="space-y-1">
              <div className="text-sm text-slate-600">Mode</div>
              <div className="bg-slate-100 rounded-xl p-1">
                <select
                  aria-label="Mode selector"
                  value={tab}
                  onChange={(event) => setTab(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-slate-900 focus:outline-none"
                >
                  {TAB_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {activeWO && (
            <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 md:col-start-1 md:row-start-2 md:row-end-3">
              <div className="text-sm font-semibold text-slate-900">Work order notes</div>
              <textarea
                placeholder="Log misc install status, returns, or follow-ups for the work order."
                className="w-full rounded-2xl border px-3 py-2 min-h-[80px] text-sm leading-relaxed"
                value={noteForActive}
                onChange={(event) => updateWorkOrderNote(activeWO, event.target.value)}
              />
              <div className="text-xs text-gray-500">
                Notes are saved per work order and persist while this session is running.
              </div>
            </div>
          )}
        </div>

        {tab === "chargeout" ? (
          <Section
            title="Material Charge-out"
            subtitle="Review the spans and journal entries before sending the chargeout to MM"
            variant="default"
          >
            {activeWO ? (
              <CableReelChargeoutPrototype
                workOrder={activeWO}
                grouped={groupedWithMisc}
                listReels={listReels}
                listReelSpans={listReelSpans}
                getReelChargeout={getReelChargeout}
                setReelChargeout={setReelChargeout}
                getItemState={getItemState}
                updateAllocation={handleUpdateAllocation}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Load a work order to preview its chargeout spans and journal entry matches.
              </div>
            )}
          </Section>
        ) : activeWO ? (
          <>
            <Section
              title={`Materials for WO ${activeWO}`}
              subtitle={activeWODescription}
              icon={Split}
              variant={tab}
            >
              <WOView
                wo={activeWO}
                grouped={groupedWithMisc}
                baseGrouped={grouped}
                getItemState={getItemState}
                upsertAllocation={handleUpsertAllocation}
                removeAllocation={handleRemoveAllocation}
                setAssetMeta={handleSetAssetMeta}
                setReelSpan={handleSetReelSpan}
                removeReelSpan={handleRemoveReelSpan}
                getReelSpan={getReelSpan}
                listReels={listReels}
                getReelSpanMap={getReelSpanMap}
                setCableMode={setCableMode}
                addReelAllocation={handleAddReelAllocation}
                updateAllocation={handleUpdateAllocation}
                tab={tab}
                allocState={allocState}
                onResetItem={handleItemReset}
                addMiscEntry={(itemNumber, description) => registerMiscEntry(activeWO, itemNumber, description)} // ensures function bound to current work order
                removeMiscEntry={(code) => removeMiscEntry(activeWO, code)}
                nextMiscCode={nextMiscCode}
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
        {showAuditPanel && (
          <div className="fixed inset-0 z-40 flex items-center justify-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAuditPanel(false)} />
            <div className="relative z-10 h-full max-w-md border-l border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Audit trail</div>
                  <p className="text-xs text-slate-500">
                    Read-only log for {activeWO || "no work order selected"}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuditPanel(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              <div className="flex h-full flex-col space-y-3 overflow-auto p-4">
                {activeWO ? (
                  auditEntriesForActive.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                      No audit records yet. Actions like allocations or status changes will appear here.
                    </div>
                  ) : (
                    auditEntriesForActive.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{event.action}</span>
                          <span className="text-slate-500">{formatTimestamp(event.modifiedAt)}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {event.details || "No additional context"}
                        </div>
                        <div className="text-xs text-slate-500">By {event.modifiedBy || "Unknown user"}</div>
                      </div>
                    ))
                  )
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                    Load a work order to view its audit trail.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="fixed bottom-4 right-4 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500 backdrop-blur-sm">
        v{APP_VERSION}
      </div>
    </div>
  );
}
