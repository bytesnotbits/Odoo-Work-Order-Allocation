import { useState, useRef, useEffect, useMemo } from "react";
import { ALLOCATION_OPTIONS, MISC_PRODUCT_NOTE, isMiscProductCode, SEPCAT_OPTIONS } from "../lib/data";
import {
  computeSpanGaps,
  collectReelIntervals,
  normalizeReelBounds,
  isPendingAllocation,
  normalizeSerialKey,
} from "../lib/reelSpans";
import Badge from "./Badge";
import { Plus, Trash2, Ruler } from "lucide-react";

const DEFAULT_PENDING_CATEGORY =
  ALLOCATION_OPTIONS.find((option) => option.toLowerCase() === "pending") || "Pending";
const SYNTHETIC_PLACEHOLDER_CATEGORY = "PLACEHOLDER";

const ASSET_META_SUPPRESSED_CATEGORIES = new Set(["pending", "returned", "expense"]);

export default function ProductCard({
  wo, product, getItemState,
  upsertAllocation, removeAllocation, setAssetMeta,
  setReelSpan, removeReelSpan, getReelSpan, listReels, getReelSpanMap, setCableMode, addReelAllocation, updateAllocation, tab, locked,
  isMiscRemovable = false, onRemoveMisc
}) {
  // Avoid throwing in test environment where window.alert is "not implemented"
  const safeAlert = (msg) => {
    try { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg) } catch { /* no-op in tests */ }
  };
  const [copiedMetaKey, setCopiedMetaKey] = useState("");
  const copyTimeoutRef = useRef(null);
  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);
  const assetFieldLabels = {
    assetId: "Asset ID",
    coeLoc: "COE LOC",
    rackBay: "RACK/BAY",
    sepcat: "SEPCAT",
  };
  const copyChipClasses = [
    "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-semibold transition group relative overflow-visible",
    "border-slate-200 bg-white text-slate-900",
    "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500",
    "cursor-pointer select-none",
  ].join(" ");
  const copyChipTruncate = "max-w-[10rem] overflow-hidden whitespace-nowrap text-ellipsis";
  const markCopiedMetaKey = (key) => {
    setCopiedMetaKey(key);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedMetaKey("");
    }, 1400);
  };
  const copyAssetField = async (fieldKey, value, metaKey) => {
    if (!value) return;
    const label = assetFieldLabels[fieldKey] || fieldKey;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } else {
        throw new Error("Clipboard not available");
      }
      markCopiedMetaKey(metaKey || `${fieldKey}`);
    } catch (error) {
      console.error("Failed to copy asset data", fieldKey, error);
      safeAlert(`Failed to copy ${label}. Please copy it manually.`);
    }
  };
  const formatSpanInput = (value) => (value === "" || value === undefined || value === null) ? "" : String(value);
  const {
    base, extra, totalAvailable, allocatedSum,
    pendingReturnSum, returnedSum, netAllocated, remaining,
    cableMode, cableSuggested
  } = getItemState(wo, product.code);
  const safeIdValue = (value) => String(value || "").replace(/[^a-zA-Z0-9-_:.]+/g, "-") || "field";
  const sepcatFieldId = `sepcat-${safeIdValue(wo)}-${safeIdValue(product.code)}`;
  const allocationCategoryFieldId = `allocation-category-${safeIdValue(wo)}-${safeIdValue(product.code)}`;
  const productScope = `${safeIdValue(wo)}-${safeIdValue(product.code)}`;
  const buildInputName = (suffix) => `${suffix}-${productScope}`;
  const buildAssetMetaName = (field, allocationId) =>
    `${field}-${safeIdValue(String(allocationId ?? "allocation"))}-${productScope}`;
  const isMiscProduct = isMiscProductCode(product.code);
  const productGroupLabel = String(product.group || "").trim().toUpperCase();
  const isScxrProduct = productGroupLabel.includes("SCXR");
  const isAccountingMode = tab === "accounting";
  const modeSectionBorder = isAccountingMode ? "border-rose-200" : "border-slate-200";
  const modeSectionBg = isAccountingMode ? "bg-rose-50" : "bg-gray-50";
  const modeHeadingColor = isAccountingMode ? "text-rose-900" : "text-slate-900";
  const modeNoteColor = isAccountingMode ? "text-rose-600" : "text-slate-600";
  const modeBadgeClass = isAccountingMode
    ? "border-rose-200 bg-rose-100 text-rose-800"
    : "border-slate-200 bg-white text-slate-600";
  const [allocQty, setAllocQty] = useState("");
  const [allocId, setAllocId] = useState("");
  const [allocCategory, setAllocCategory] = useState(ALLOCATION_OPTIONS[0]);
  const [allocCategoryCustom, setAllocCategoryCustom] = useState("");
  const [outer, setOuter] = useState("");
  const [inner, setInner] = useState("");
  const [reelSerial, setReelSerial] = useState("");
  const [spanStartInput, setSpanStartInput] = useState("");
  const [spanEndInput, setSpanEndInput] = useState("");
  const [selectedSpanId, setSelectedSpanId] = useState("");
  const [selectedAllocation, setSelectedAllocation] = useState(null);
  const [selectedPendingCardId, setSelectedPendingCardId] = useState(null);
  const [coeLocInput, setCoeLocInput] = useState("");
  const [rackBayInput, setRackBayInput] = useState("");
  const [sepcatInput, setSepcatInput] = useState(SEPCAT_OPTIONS[0]);
  const [highlightedFields, setHighlightedFields] = useState({});
  const highlightTimeoutsRef = useRef({});
  useEffect(() => () => {
    Object.values(highlightTimeoutsRef.current).forEach(clearTimeout);
  }, []);
  const FIELD_KEYS = {
    ALLOCATION_QTY: "allocation-qty",
    ALLOCATION_NOTES: "allocation-notes",
    ALLOCATION_CATEGORY: "allocation-category",
    CUSTOM_CATEGORY: "custom-category",
    ENGINEERING_COE_LOC: "engineering-coe-loc",
    ENGINEERING_RACK_BAY: "engineering-rack-bay",
    ENGINEERING_SEPCAT: "engineering-sepcat",
    OPTIONAL_REEL_SERIAL: "optional-reel-serial",
    REEL_INNER: "reel-inner",
    REEL_OUTER: "reel-outer",
  };
  const triggerFieldHighlight = (fieldKey) => {
    if (!fieldKey) return;
    setHighlightedFields((prev) => ({ ...prev, [fieldKey]: true }));
    if (highlightTimeoutsRef.current[fieldKey]) {
      clearTimeout(highlightTimeoutsRef.current[fieldKey]);
    }
    highlightTimeoutsRef.current[fieldKey] = setTimeout(() => {
      setHighlightedFields((prev) => {
        if (!prev[fieldKey]) return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      delete highlightTimeoutsRef.current[fieldKey];
    }, 2000);
  };
  const updateFieldWithHighlight = (setter, fieldKey, value) => {
    setter(value);
    triggerFieldHighlight(fieldKey);
  };
  const fieldHighlightClasses = (fieldKey) =>
    highlightedFields[fieldKey] ? "highlighted-field" : "";

  if (!base) return null;

  const reelFootage = Math.abs((Number(inner) || 0) - (Number(outer) || 0));
  const reelSpanMap = getReelSpanMap(wo, product.code);
  const knownReels = listReels(wo, product.code);
  const fallbackSpan = reelSerial ? getReelSpan(wo, product.code, reelSerial) : null;
  const activeSpan = selectedSpanId
    ? getReelSpan(wo, product.code, reelSerial, selectedSpanId)
    : fallbackSpan;
  const spanStartNum = isFinite(Number(activeSpan?.start)) ? Number(activeSpan.start) : null;
  const spanEndNum = isFinite(Number(activeSpan?.end)) ? Number(activeSpan.end) : null;
  const spanMin = spanStartNum !== null && spanEndNum !== null ? Math.min(spanStartNum, spanEndNum) : null;
  const spanMax = spanStartNum !== null && spanEndNum !== null ? Math.max(spanStartNum, spanEndNum) : null;
  const handleSelectReel = (serial) => {
    const spans = reelSpanMap[serial] || [];
    setReelSerial(serial);
    if (spans.length > 0) {
      const lastSpan = spans[spans.length - 1];
      setSelectedSpanId(lastSpan.id);
      setSpanStartInput(formatSpanInput(lastSpan.start));
      setSpanEndInput(formatSpanInput(lastSpan.end));
      setOuter(formatSpanInput(lastSpan.start));
      setInner(formatSpanInput(lastSpan.end));
      return;
    }
    setSelectedSpanId("");
    setSpanStartInput("");
    setSpanEndInput("");
    setOuter("");
    setInner("");
  };
  const handleSelectSpan = (serial, span) => {
    setReelSerial(serial);
    setSelectedSpanId(span.id);
    setSpanStartInput(formatSpanInput(span.start));
    setSpanEndInput(formatSpanInput(span.end));
    setOuter(formatSpanInput(span.start));
    setInner(formatSpanInput(span.end));
  };
  const handleRemoveReel = (serial) => {
    const spans = reelSpanMap[serial] || [];
    spans.forEach((span) => {
      extra.allocations
        .filter(
          (alloc) =>
            alloc.type === "reel" &&
            normalizeSerialKey(alloc.reelSerial) === normalizeSerialKey(serial) &&
            alloc.spanId === span.id,
        )
        .forEach((alloc) => removeAllocation(wo, product.code, alloc.id));
    });
    removeReelSpan(wo, product.code, serial);
    if (serial === reelSerial) {
      setReelSerial("");
      setSpanStartInput("");
      setSpanEndInput("");
      setSelectedSpanId("");
    }
  };
  const buildReelTimeline = (spans) => {
    if (!Array.isArray(spans) || spans.length === 0) return null;
    const validSpans = spans
      .filter(
        (span) =>
          span &&
          Number.isFinite(span.start) &&
          Number.isFinite(span.end) &&
          span.end > span.start,
      )
      .sort((a, b) => (a.start || 0) - (b.start || 0) || (a.end || 0) - (b.end || 0));
    if (validSpans.length === 0) return null;
    const minStart = validSpans.reduce((min, span) => Math.min(min, span.start), Number.POSITIVE_INFINITY);
    const maxEnd = validSpans.reduce((max, span) => Math.max(max, span.end), Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) return null;
    const totalSpan = maxEnd - minStart;
    const segments = validSpans.map((span) => ({
      ...span,
      startPercent: ((span.start - minStart) / totalSpan) * 100,
      widthPercent: ((span.end - span.start) / totalSpan) * 100,
      label: `[${span.start}–${span.end}]`,
    }));
    return { minStart, maxEnd, totalSpan, segments };
  };
  const getAllocationSegmentClass = (allocation) => {
    if (isPendingAllocation(allocation)) {
      return "bg-amber-400/90 border border-amber-300/80";
    }
    if ((allocation.allocationCategory || "").trim().toLowerCase() === "returned") {
      return "bg-slate-400/90 border border-slate-300/80";
    }
    return "bg-sky-500/90 border border-sky-400/80";
  };
  const buildAllocationSegments = (serial, minStart, maxEnd) => {
    if (!serial || !Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) return [];
    const serialKey = normalizeSerialKey(serial);
    const totalSpan = maxEnd - minStart;
    return (extra.allocations || [])
      .filter(
        (alloc) =>
          alloc?.type === "reel" &&
          Number.isFinite(alloc.outer) &&
          Number.isFinite(alloc.inner) &&
          normalizeSerialKey(alloc.reelSerial) === serialKey,
      )
      .map((alloc, idx) => {
        const start = Math.min(alloc.outer, alloc.inner);
        const end = Math.max(alloc.outer, alloc.inner);
        const clampedStart = Math.max(minStart, Math.min(maxEnd, start));
        const clampedEnd = Math.max(minStart, Math.min(maxEnd, end));
        if (clampedEnd <= clampedStart) return null;
        const widthPercent = ((clampedEnd - clampedStart) / totalSpan) * 100;
        const startPercent = ((clampedStart - minStart) / totalSpan) * 100;
        return {
          id: alloc.id || idx,
          startPercent,
          widthPercent,
          allocation: alloc,
        };
      })
      .filter(Boolean);
  };
  const formatTimelineValue = (value) => (Number.isFinite(value) ? value : "—");
  const reelSpanSummaries = knownReels.map((serial) => {
    const spans = reelSpanMap[serial] || [];
    if (spans.length === 0) return { serial, hasSpan: false };
    const total = spans.reduce((sum, span) => sum + Math.abs(span.end - span.start), 0);
    const covered = extra.allocations
      .filter((a) => a.type === "reel" && normalizeSerialKey(a.reelSerial) === normalizeSerialKey(serial) && a.outer != null && a.inner != null)
      .reduce((sum, a) => sum + Math.abs(a.outer - a.inner), 0);
    const remainingSpan = Math.max(total - covered, 0);
    return { serial, hasSpan: true, total, covered, remainingSpan };
  });
  const spanBounds = reelSerial && activeSpan ? normalizeReelBounds(activeSpan.start, activeSpan.end) : null;
  const missingSegments = spanBounds
    ? computeSpanGaps(
        spanBounds,
        collectReelIntervals(extra.allocations, reelSerial, (alloc) => !isPendingAllocation(alloc)),
      )
    : [];
  const primaryButton = [
    "inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition font-semibold shadow-sm",
    "bg-blue-600 text-white border-blue-600",
    "hover:bg-blue-700 active:bg-blue-800",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500",
    "disabled:bg-blue-200 disabled:border-blue-200 disabled:text-white disabled:cursor-not-allowed",
  ].join(" ");
  const secondaryButton = [
    "inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition font-semibold shadow-sm",
    "bg-white text-slate-900 border-slate-200",
    "hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");

  const allocationOptionsForProduct = useMemo(
    () => (isScxrProduct ? ["SCXR"] : ALLOCATION_OPTIONS),
    [isScxrProduct],
  );
  useEffect(() => {
    setAllocCategory(allocationOptionsForProduct[0]);
    setAllocCategoryCustom("");
  }, [allocationOptionsForProduct]);
  const finalCategory = () =>
    allocCategory === "__custom__" ? (allocCategoryCustom || "Custom") : allocCategory;
  const isCustomCategory = () => allocCategory === "__custom__";
  const hasScxrMetaInput = isScxrProduct && [coeLocInput, rackBayInput, sepcatInput].some((value) => String(value || "").trim() !== "");
  const scxrMeta = hasScxrMetaInput
    ? { coeLoc: coeLocInput, rackBay: rackBayInput, sepcat: sepcatInput }
    : null;
  const isReturnCategory = (category) => ["Returned", "Pending"].includes(category);
  const isPendingCategory = (category) =>
    String(category || "").trim().toLowerCase() === DEFAULT_PENDING_CATEGORY.toLowerCase();
  const buildRegularPayload = (qty, categoryName) => ({
    type: "regular",
    qty,
    allocationId: allocId || "",
    allocationCategory: categoryName,
    allocationCategoryIsCustom: isCustomCategory(),
    reelSerial,
  });
  const isEditingRegular = Boolean(
    selectedAllocation?.id &&
      selectedAllocation.type !== "reel" &&
      typeof updateAllocation === "function"
  );

  function addRegular() {
    const qty = Number(allocQty);
    if (!qty || qty <= 0) return safeAlert("Enter a positive quantity");
    const categoryName = finalCategory();
    const isReturn = isReturnCategory(categoryName);
    if (!isReturn && !isMiscProduct && qty > remaining) return safeAlert("Quantity exceeds remaining available");
    const payload = buildRegularPayload(qty, categoryName);
    if (selectedAllocation?.id && selectedAllocation.type !== "reel" && typeof updateAllocation === "function") {
      updateAllocation(wo, product.code, selectedAllocation.id, payload);
    } else {
      console.info(
        "Add Asset metadata captured:",
        scxrMeta || "(none)",
        "for allocation payload",
        payload,
      );
      upsertAllocation(wo, product.code, payload, scxrMeta);
    }
    setAllocQty("");
    setAllocId("");
    setReelSerial("");
    setAllocCategory(allocationOptionsForProduct[0]);
    setAllocCategoryCustom("");
    setSelectedAllocation(null);
    setCoeLocInput("");
    setRackBayInput("");
    setSepcatInput(SEPCAT_OPTIONS[0]);
  }

  function handleUpdateRegular() {
    if (!isEditingRegular) return;
    const qty = Number(allocQty);
    if (!qty || qty <= 0) return safeAlert("Enter a positive quantity");
    const categoryName = finalCategory();
    const isReturn = isReturnCategory(categoryName);
    const existingQty = Number(selectedAllocation?.qty ?? 0);
    const availableForUpdate = remaining + existingQty;
    if (!isReturn && !isMiscProduct && qty > availableForUpdate) {
      return safeAlert("Quantity exceeds remaining available");
    }
    const payload = buildRegularPayload(qty, categoryName);
    updateAllocation(wo, product.code, selectedAllocation.id, payload);
  }

  function addReelPiece() {
    if (!reelSerial) return safeAlert("Enter a Reel/Serial Number for this piece");
    if (reelFootage <= 0) return safeAlert("Enter valid outer/inner to compute footage");
    const categoryName = finalCategory();
    const isReturn = isReturnCategory(categoryName);
    const editingReel = selectedAllocation?.id && selectedAllocation.type === "reel";
    const existingReelFootage = editingReel ? Number(selectedAllocation?.footage ?? 0) : 0;
    const availableFootage = editingReel ? remaining + existingReelFootage : remaining;
    if (!isReturn && !isMiscProduct && reelFootage > availableFootage) return safeAlert("Footage exceeds remaining available");

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

    if (addReelAllocation) {
      const options = editingReel
        ? { replaceId: selectedAllocation.id, assetMeta: scxrMeta }
        : scxrMeta
          ? { assetMeta: scxrMeta }
          : undefined;
      const result = addReelAllocation(wo, product.code, basePayload, options);
      if (result?.error) return safeAlert(result.error);
      setOuter("");
      setInner("");
      setAllocId("");
      setReelSerial("");
      setAllocCategory(allocationOptionsForProduct[0]);
      setAllocCategoryCustom("");
      setSelectedAllocation(null);
      setCoeLocInput("");
      setRackBayInput("");
      setSepcatInput(SEPCAT_OPTIONS[0]);
      return;
    }

    const payload = { ...basePayload, footage: reelFootage };
    upsertAllocation(wo, product.code, payload, scxrMeta);

    setOuter("");
    setInner("");
    setAllocId("");
    setReelSerial("");
    setAllocCategory(allocationOptionsForProduct[0]);
    setAllocCategoryCustom("");
    setSelectedAllocation(null);
    setCoeLocInput("");
    setRackBayInput("");
    setSepcatInput(SEPCAT_OPTIONS[0]);
  }

  const syncPendingAllocationsForSpan = (serialToUse, span) => {
    if (!addReelAllocation || !serialToUse || !span) return;
    const normalizedSerial = normalizeSerialKey(serialToUse);
    const pendingIds = extra.allocations
      .filter((alloc) => (
        alloc.type === "reel" &&
        normalizeSerialKey(alloc.reelSerial) === normalizedSerial &&
        isPendingAllocation(alloc) &&
        alloc.spanId === span.id
      ))
      .map((alloc) => alloc.id);
    pendingIds.forEach((id) => removeAllocation(wo, product.code, id));
    const accountedIntervals = collectReelIntervals(
      extra.allocations,
      serialToUse,
      (alloc) => !isPendingAllocation(alloc),
    );
    const gaps = computeSpanGaps(span, accountedIntervals);
    for (const gap of gaps) {
      const result = addReelAllocation(wo, product.code, {
        type: "reel",
        outer: gap.end,
        inner: gap.start,
        allocationId: "",
        allocationCategory: DEFAULT_PENDING_CATEGORY,
        allocationCategoryIsCustom: false,
        reelSerial: serialToUse,
        spanId: span.id,
      });
      if (result?.error) {
        safeAlert(result.error);
        break;
      }
    }
  };

  const handleSaveSpan = () => {
    const trimmedSerial = (reelSerial || "").trim();
    if (!trimmedSerial) return safeAlert("Enter reel/serial to save a span");
    const startValue = Number(spanStartInput);
    const endValue = Number(spanEndInput);
    if (!isFinite(startValue) || !isFinite(endValue)) return safeAlert("Enter numeric span start/end");
    const savedSpan = selectedSpanId
      ? setReelSpan(wo, product.code, trimmedSerial, startValue, endValue, { spanId: selectedSpanId })
      : setReelSpan(wo, product.code, trimmedSerial, startValue, endValue);
    if (!savedSpan) return safeAlert("Span start and end must differ");
    setReelSerial(trimmedSerial);
    setSelectedSpanId(savedSpan.id);
    setSpanStartInput(formatSpanInput(savedSpan.start));
    setSpanEndInput(formatSpanInput(savedSpan.end));
    syncPendingAllocationsForSpan(trimmedSerial, savedSpan);
  };

  const handleRevertToPending = (alloc) => {
    if (!alloc || isPendingCategory(alloc.allocationCategory)) return;
    if (typeof updateAllocation === "function") {
      updateAllocation(wo, product.code, alloc.id, {
        allocationCategory: DEFAULT_PENDING_CATEGORY,
        allocationCategoryIsCustom: false,
      });
    } else {
      removeAllocation(wo, product.code, alloc.id);
    }
  };

  const handleDeleteAllocation = (alloc) => {
    if (!alloc?.id) return;
    removeAllocation(wo, product.code, alloc.id);
    if (selectedAllocation?.id === alloc.id) {
      setSelectedAllocation(null);
      setAllocQty("");
      setAllocId("");
      setAllocCategory(allocationOptionsForProduct[0]);
      setAllocCategoryCustom("");
      setReelSerial("");
      setOuter("");
      setInner("");
      setCoeLocInput("");
      setRackBayInput("");
      setSepcatInput(SEPCAT_OPTIONS[0]);
    }
  };

  const defaultCategory = ALLOCATION_OPTIONS[0] || "";
  const handleSelectAllocation = (alloc) => {
    setSelectedPendingCardId(null);
    setSelectedAllocation(alloc);
    const rawAssetMeta = (extra.assets && extra.assets[alloc.id]) || {};
    const allocMeta = typeof rawAssetMeta === "object"
      ? rawAssetMeta
      : { assetId: rawAssetMeta ?? "", coeLoc: "", rackBay: "", sepcat: "" };
    updateFieldWithHighlight(setAllocId, FIELD_KEYS.ALLOCATION_NOTES, alloc.allocationId || "");
    if (alloc.allocationCategoryIsCustom) {
      updateFieldWithHighlight(setAllocCategory, FIELD_KEYS.ALLOCATION_CATEGORY, "__custom__");
      updateFieldWithHighlight(setAllocCategoryCustom, FIELD_KEYS.CUSTOM_CATEGORY, alloc.allocationCategory || "");
    } else {
      updateFieldWithHighlight(setAllocCategory, FIELD_KEYS.ALLOCATION_CATEGORY, alloc.allocationCategory || defaultCategory);
      updateFieldWithHighlight(setAllocCategoryCustom, FIELD_KEYS.CUSTOM_CATEGORY, "");
    }
    updateFieldWithHighlight(setReelSerial, FIELD_KEYS.OPTIONAL_REEL_SERIAL, alloc.reelSerial || "");
    if (alloc.type === "reel") {
      updateFieldWithHighlight(setOuter, FIELD_KEYS.REEL_OUTER, formatSpanInput(alloc.outer));
      updateFieldWithHighlight(setInner, FIELD_KEYS.REEL_INNER, formatSpanInput(alloc.inner));
      updateFieldWithHighlight(setAllocQty, FIELD_KEYS.ALLOCATION_QTY, "");
    } else {
      updateFieldWithHighlight(setAllocQty, FIELD_KEYS.ALLOCATION_QTY, alloc.qty != null ? String(alloc.qty) : "");
      updateFieldWithHighlight(setOuter, FIELD_KEYS.REEL_OUTER, "");
      updateFieldWithHighlight(setInner, FIELD_KEYS.REEL_INNER, "");
    }
    updateFieldWithHighlight(setCoeLocInput, FIELD_KEYS.ENGINEERING_COE_LOC, allocMeta.coeLoc || "");
    updateFieldWithHighlight(setRackBayInput, FIELD_KEYS.ENGINEERING_RACK_BAY, allocMeta.rackBay || "");
    updateFieldWithHighlight(setSepcatInput, FIELD_KEYS.ENGINEERING_SEPCAT, allocMeta.sepcat || SEPCAT_OPTIONS[0]);
  };

  const primeSyntheticPendingForm = (qty, pendingCardId = null) => {
    setSelectedAllocation(null);
    setSelectedPendingCardId(pendingCardId);
    updateFieldWithHighlight(setAllocId, FIELD_KEYS.ALLOCATION_NOTES, "");
    updateFieldWithHighlight(setAllocQty, FIELD_KEYS.ALLOCATION_QTY, qty != null ? String(qty) : "");
    const pendingCategoryAvailable = allocationOptionsForProduct.includes(DEFAULT_PENDING_CATEGORY);
    const pendingFormCategory = pendingCategoryAvailable
      ? DEFAULT_PENDING_CATEGORY
      : allocationOptionsForProduct[0] || DEFAULT_PENDING_CATEGORY;
    updateFieldWithHighlight(setAllocCategory, FIELD_KEYS.ALLOCATION_CATEGORY, pendingFormCategory);
    updateFieldWithHighlight(setAllocCategoryCustom, FIELD_KEYS.CUSTOM_CATEGORY, "");
    updateFieldWithHighlight(setReelSerial, FIELD_KEYS.OPTIONAL_REEL_SERIAL, "");
    updateFieldWithHighlight(setOuter, FIELD_KEYS.REEL_OUTER, "");
    updateFieldWithHighlight(setInner, FIELD_KEYS.REEL_INNER, "");
    updateFieldWithHighlight(setCoeLocInput, FIELD_KEYS.ENGINEERING_COE_LOC, "");
    updateFieldWithHighlight(setRackBayInput, FIELD_KEYS.ENGINEERING_RACK_BAY, "");
    updateFieldWithHighlight(setSepcatInput, FIELD_KEYS.ENGINEERING_SEPCAT, SEPCAT_OPTIONS[0]);
  };

  const hasUnresolvedQuantities = remaining > 0 || pendingReturnSum > 0;
  const cardStateClasses = hasUnresolvedQuantities
    ? "bg-white border-gray-200"
    : "bg-green-50 border-green-200";

  const workOrderSlug = String(wo || "").replace(/\s+/g, "-");
  const productSlug = String(product.code || "").replace(/\s+/g, "-");
  const hasPendingReturnAllocations = pendingReturnSum > 0;
  const shouldShowSyntheticPending = remaining > 0 && !hasPendingReturnAllocations;
  const syntheticPendingAllocation = shouldShowSyntheticPending
    ? {
        id: `pending-${workOrderSlug}-${productSlug}`,
        type: "regular",
        allocationCategory: SYNTHETIC_PLACEHOLDER_CATEGORY,
        allocationCategoryIsCustom: false,
        allocationId: "Auto Generated",
        qty: remaining,
        __isPendingPlaceholder: true,
      }
    : null;
  const allocationsToShow = syntheticPendingAllocation
    ? [...extra.allocations, syntheticPendingAllocation]
    : extra.allocations;

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

      <div className="mt-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${modeBadgeClass}`}
        >
          {isAccountingMode ? "Accounting form" : "Engineering form"}
        </span>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
          {/* LEFT: Add allocation (unchanged) */}
          <div className={`rounded-xl p-3 border ${modeSectionBorder} ${modeSectionBg}`}>
            <div className={`font-medium mb-2 ${modeHeadingColor}`}>Add allocation</div>

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

            {isScxrProduct && (
              <div className="grid md:grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">COE LOC</label>
                  <input
                    name={buildInputName("engineering-coe-loc")}
                    className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ENGINEERING_COE_LOC)}`}
                    placeholder="COE LOC"
                    value={coeLocInput}
                    onChange={(e) => setCoeLocInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">Rack/Bay</label>
                  <input
                    name={buildInputName("engineering-rack-bay")}
                    className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ENGINEERING_RACK_BAY)}`}
                    placeholder="RACK/BAY"
                    value={rackBayInput}
                    onChange={(e) => setRackBayInput(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={sepcatFieldId} className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                    SEPCAT
                  </label>
                  <select
                    id={sepcatFieldId}
                    className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ENGINEERING_SEPCAT)}`}
                    value={sepcatInput}
                    onChange={(e) => setSepcatInput(e.target.value)}
                  >
                    {SEPCAT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {!cableMode && (
              <div className="space-y-2">
                <label className="block text-sm">Quantity</label>
                <input
                  name={buildInputName("allocation-qty")}
                  type="number"
                  min={0}
                  step={1}
                  className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ALLOCATION_QTY)}`}
                  value={allocQty}
                  onChange={(e) => setAllocQty(e.target.value)}
                />
                <label className="block text-sm">Allocation notes (optional)</label>
                <input
                  name={buildInputName("allocation-notes")}
                  className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ALLOCATION_NOTES)}`}
                  value={allocId}
                  onChange={(e) => setAllocId(e.target.value)}
                  placeholder="e.g., AERIAL-FIBER-01"
                />
                <label htmlFor={allocationCategoryFieldId} className="block text-sm mt-2">Allocation Category</label>
                <div className="flex gap-2">
                  <select
                    id={allocationCategoryFieldId}
                    name={buildInputName("allocation-category")}
                    className={`border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ALLOCATION_CATEGORY)}`}
                    value={allocCategory}
                    onChange={(e) => setAllocCategory(e.target.value)}
                  >
                    {allocationOptionsForProduct.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {allocCategory === "__custom__" && (
                    <input
                      name={buildInputName("custom-category")}
                      className={`flex-1 border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.CUSTOM_CATEGORY)}`}
                      placeholder="Enter custom category"
                      value={allocCategoryCustom}
                      onChange={(e) => setAllocCategoryCustom(e.target.value)}
                    />
                  )}
                </div>
                <label className="block text-sm mt-2">Reel/Serial Number (optional)</label>
                <input
                  name={buildInputName("optional-reel-serial")}
                    className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.OPTIONAL_REEL_SERIAL)}`}
                  value={reelSerial}
                  onChange={(e) => setReelSerial(e.target.value)}
                  placeholder="e.g., REEL-12345 or SN-0001"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addRegular}
                    className={primaryButton}
                    aria-label="Add Asset"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span className="font-medium">Add Asset</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateRegular}
                    className={secondaryButton}
                    disabled={!isEditingRegular}
                    aria-label="Update selected asset"
                  >
                    Update existing
                  </button>
                </div>
              </div>
            )}

            {cableMode && (
              <div className="space-y-3">
                <div className="bg-white border rounded-xl p-3 space-y-3">
                  <div className="font-medium text-sm text-slate-700">Known reels & spans</div>
                  {knownReels.length === 0 ? (
                    <div className="text-[11px] text-slate-500">No spans saved for this product yet.</div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        {knownReels.map((serial) => {
                          const spans = reelSpanMap[serial] || [];
                          const timeline = buildReelTimeline(spans);
                          const allocationSegments = timeline
                            ? buildAllocationSegments(serial, timeline.minStart, timeline.maxEnd)
                            : [];
                          return (
                            <div key={serial} className="space-y-2">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <button
                                    type="button"
                                    className={[
                                      "px-2 py-1 rounded-full border text-[11px] transition whitespace-nowrap",
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
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveReel(serial);
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="flex flex-1 min-w-0 gap-2 overflow-x-auto whitespace-nowrap">
                                  {spans.length > 0 &&
                                    spans.map((span) => {
                                      const isActiveSpan =
                                        span.id === selectedSpanId;
                                      return (
                                        <button
                                          type="button"
                                          key={span.id}
                                          className={[
                                            "px-2 py-1 rounded-full border text-[11px] transition whitespace-nowrap text-center min-w-[84px]",
                                            isActiveSpan
                                              ? "bg-slate-900 text-white border-slate-900"
                                              : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
                                          ].join(" ")}
                                          onClick={() =>
                                            handleSelectSpan(serial, span)
                                          }
                                        >
                                          [{span.start}–{span.end}]
                                        </button>
                                      );
                                    })}
                                </div>
                              </div>
                              <div>
                                {timeline ? (
                                  <div className="space-y-1 text-[11px] text-slate-500">
                                    <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                                      {timeline.segments.map((segment, idx) => (
                                        <span
                                          key={`span-${serial}-${segment.id ?? idx}`}
                                          className="absolute inset-y-0 rounded-full bg-slate-800/90 transition-all"
                                          style={{
                                            left: `${segment.startPercent}%`,
                                            width: `${Math.min(Math.max(segment.widthPercent, 0), 100)}%`,
                                          }}
                                          title={`${segment.label}`}
                                        />
                                      ))}
                                      {allocationSegments.map((segment) => (
                                        <span
                                          key={`alloc-${serial}-${segment.id}`}
                                          className={`absolute inset-y-0 rounded-full opacity-90 ${getAllocationSegmentClass(
                                            segment.allocation,
                                          )} z-10`}
                                          style={{
                                            left: `${segment.startPercent}%`,
                                            width: `${Math.min(Math.max(segment.widthPercent, 0), 100)}%`,
                                          }}
                                          title={`${segment.allocation.allocationId || "Allocation"} ${segment.allocation.allocationCategory || ""}`.trim()}
                                        />
                                      ))}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-400 uppercase tracking-wide">
                                      <span>from {formatTimelineValue(timeline.minStart)}</span>
                                      <span>to {formatTimelineValue(timeline.maxEnd)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400">
                                    Timeline: no spans recorded yet.
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-sky-500/90 border border-sky-400/80" />
                          Allocated
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-amber-400/90 border border-amber-300/80" />
                          Pending
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-slate-400/90 border border-slate-300/80" />
                          Returned
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        {reelSpanSummaries.map(({ serial, hasSpan, total, covered, remainingSpan }) => {
                          if (!hasSpan) {
                            return (
                              <div key={serial} className="text-gray-500">
                                [{serial}] No span saved for this reel yet.
                              </div>
                            );
                          }

                          if (remainingSpan === 0) {
                            return null;
                          }

                          return (
                            <div
                              key={serial}
                              className={`text-gray-600 ${serial === reelSerial ? "text-gray-800 font-semibold" : ""}`}
                            >
                              [{serial}] Span total: <b>{total}</b> | Covered: <b>{covered}</b> | Remaining: <b>{remainingSpan}</b>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {spanBounds && (
                    <div className="mt-3 text-sm">
                      {missingSegments.length === 0 ? (
                        <div className="text-emerald-700 font-semibold">Span fully accounted for</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">
                            Unaccounted span segments
                          </div>
                          <ul className="list-disc list-inside text-amber-700">
                            {missingSegments.map((segment, idx) => (
                              <li key={`${segment.start}-${segment.end}-${idx}`} className="leading-tight">
                                <span className="font-semibold text-amber-900">
                                  [{segment.start}–{segment.end}]
                                </span>{" "}
                                {Math.abs(segment.end - segment.start)} ft unallocated / missing
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-xl p-3 space-y-3">
                  <div className="font-medium text-sm text-slate-700">Reel & span (optional)</div>
                  <div className="grid md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-sm">Reel/Serial Number</label>
                      <input
                        name={buildInputName("span-reel-serial")}
                        className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.OPTIONAL_REEL_SERIAL)}`}
                        value={reelSerial}
                        onChange={(e) => {
                          setReelSerial(e.target.value);
                          setSelectedSpanId("");
                        }}
                        placeholder="REEL-XXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-sm">Inner Seq</label>
                      <input
                        name={buildInputName("span-inner")}
                        type="number"
                        className="w-full border rounded-xl p-2"
                        value={spanStartInput}
                        onChange={(e) => setSpanStartInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm">Outer Seq</label>
                      <input
                        name={buildInputName("span-outer")}
                        type="number"
                        className="w-full border rounded-xl p-2"
                        value={spanEndInput}
                        onChange={(e) => setSpanEndInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <button disabled={locked} onClick={handleSaveSpan} className={primaryButton + " px-3 py-1"}>
                      Save span
                    </button>
                  </div>
                </div>

                <div className="bg-white border rounded-xl p-3 space-y-3">
                  <div className="flex items-center gap-2"><Ruler className="w-4 h-4" /> <div className="font-medium">Reel piece</div></div>
                  <div className="grid md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-sm">Reel/Serial Number <span className="text-red-500">*</span></label>
                      <input
                        name={buildInputName("piece-reel-serial")}
                        className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.OPTIONAL_REEL_SERIAL)}`}
                        value={reelSerial}
                        onChange={(e) => {
                          setReelSerial(e.target.value);
                          setSelectedSpanId("");
                        }}
                        placeholder="REEL-XXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-sm">Inner Seq</label>
                      <input
                        name={buildInputName("piece-inner")}
                        type="number"
                        className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.REEL_INNER)}`}
                        value={inner}
                        onChange={(e) => setInner(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm">Outer Seq</label>
                      <input
                        name={buildInputName("piece-outer")}
                        type="number"
                        className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.REEL_OUTER)}`}
                        value={outer}
                        onChange={(e) => setOuter(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">Footage = |Inner − Outer| → <b>{reelFootage}</b></div>
                  <label className="block text-sm mt-2">Allocation notes (optional)</label>
                  <input
                    name={buildInputName("piece-allocation-notes")}
                    className={`w-full border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ALLOCATION_NOTES)}`}
                    value={allocId}
                    onChange={(e) => setAllocId(e.target.value)}
                    placeholder="e.g., AERIAL-SPAN-12"
                  />
                  <label className="block text-sm mt-2">Allocation Category</label>
                  <div className="flex gap-2">
                    <select
                      name={buildInputName("piece-allocation-category")}
                      className={`border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.ALLOCATION_CATEGORY)}`}
                      value={allocCategory}
                      onChange={(e) => setAllocCategory(e.target.value)}
                    >
                      {ALLOCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {allocCategory === "__custom__" && (
                      <input
                        name={buildInputName("piece-custom-category")}
                        className={`flex-1 border rounded-xl p-2 transition-colors ${fieldHighlightClasses(FIELD_KEYS.CUSTOM_CATEGORY)}`}
                        placeholder="Enter custom category"
                        value={allocCategoryCustom}
                        onChange={(e) => setAllocCategoryCustom(e.target.value)}
                      />
                    )}
                  </div>
                  <button disabled={locked} onClick={addReelPiece} className={primaryButton}><Plus className="w-4 h-4" /> Add piece</button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Allocations (engineering can also capture asset meta) */}
          <div className={`rounded-xl p-3 border ${modeSectionBorder} ${modeSectionBg}`}>
            <div className={`font-medium mb-2 ${modeHeadingColor}`}>Allocations</div>
            {allocationsToShow.length === 0 ? (
            <div className={`text-sm ${modeNoteColor} py-3`}>No allocations yet.</div>
            ) : (
              <div className="space-y-3">
                {allocationsToShow.map((a) => {
                const isSyntheticPendingCard = Boolean(a.__isPendingPlaceholder);
                const isPendingReturn = isSyntheticPendingCard || isPendingCategory(a.allocationCategory);
                const isReturned = a.allocationCategory === "Returned";
                const raw = (extra.assets && extra.assets[a.id]) || {};
                const meta = typeof raw === "object"
                  ? raw
                  : { assetId: raw ?? "", coeLoc: "", rackBay: "", sepcat: "" };
                const categoryNormalized = (a.allocationCategory ?? "").trim().toLowerCase();
                const isCustomAllocation = Boolean(a.allocationCategoryIsCustom) || categoryNormalized === "custom";
                const isSuppressedCategory = ASSET_META_SUPPRESSED_CATEGORIES.has(categoryNormalized);
                const hideAssetFields = isCustomAllocation || isSuppressedCategory;
                const hideCoeFields = hideAssetFields || !isScxrProduct;
                const showCoeFields = !hideCoeFields;
                const showAssetIdField = !hideAssetFields && !isScxrProduct;
                const assetMetaFields = [];
                if (!isSyntheticPendingCard) {
                  if (showAssetIdField && meta.assetId) {
                    assetMetaFields.push({
                      key: `${a.id}|assetId`,
                      label: "Asset ID",
                      value: meta.assetId,
                      field: "assetId",
                    });
                  }
                  if (showCoeFields) {
                    if (meta.coeLoc) {
                      assetMetaFields.push({
                        key: `${a.id}|coeLoc`,
                        label: "COE LOC",
                        value: meta.coeLoc,
                        field: "coeLoc",
                      });
                    }
                    if (meta.rackBay) {
                      assetMetaFields.push({
                        key: `${a.id}|rackBay`,
                        label: "Rack/Bay",
                        value: meta.rackBay,
                        field: "rackBay",
                      });
                    }
                    if (meta.sepcat) {
                      assetMetaFields.push({
                        key: `${a.id}|sepcat`,
                        label: "SEPCAT",
                        value: meta.sepcat,
                        field: "sepcat",
                      });
                    }
                  }
                }
                const showAssetMetaSection = assetMetaFields.length > 0;
                console.debug("asset meta for card", a.id, meta);
                console.debug("asset meta for card", a.id, meta);
                const numericValue = a.type === "reel" ? a.footage : a.qty;
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
                const isSelectedAllocation = !isSyntheticPendingCard && selectedAllocation?.id === a.id;
                const isSelectedPendingCard = isSyntheticPendingCard && selectedPendingCardId === a.id;
                const selectionClasses = isSelectedAllocation || isSelectedPendingCard
                  ? "ring-2 ring-blue-500/50 shadow-lg"
                  : "hover:shadow-md";
                const handleCardActivation = () => {
                  if (isSyntheticPendingCard) {
                    primeSyntheticPendingForm(a.qty, a.id);
                    return;
                  }
                  handleSelectAllocation(a);
                };
                const eventProps = {
                  role: "button",
                  tabIndex: 0,
                  onClick: handleCardActivation,
                  onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCardActivation();
                    }
                  },
                };
                return (
                    <div
                      key={a.id}
                      className={`rounded-2xl border p-3 shadow-sm ${cardColor} ${selectionClasses} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`}
                      {...eventProps}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm font-semibold">
                          {a.type === "reel" ? "Reel piece" : "Quantity allocation"}
                        </div>
                        {!locked && !isSyntheticPendingCard && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wide transition"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRevertToPending(a);
                              }}
                              aria-label="Revert allocation to pending"
                              disabled={isPendingReturn}
                            >
                              {isPendingReturn ? "Pending" : "Revert to pending"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wide transition border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteAllocation(a);
                              }}
                              aria-label="Remove allocation permanently"
                            >
                              Remove allocation
                            </button>
                          </div>
                        )}
                      </div>
                      {a.type === "reel" && (
                        <>
                          <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                            <span className={`${chipBase} ${chipColor}`}>
                              Reel Number: <b>{a.reelSerial || "—"}</b>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                            <span className={`${chipBase} ${chipColor}`}>
                              Inner Seq: <b>{formatTimelineValue(a.inner)}</b>
                            </span>
                            <span className={`${chipBase} ${chipColor}`}>
                              Outer Seq: <b>{formatTimelineValue(a.outer)}</b>
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                        <span className={`${chipBase} ${chipColor}`}>
                          Quantity: <b className="text-xs uppercase">{numericValue ?? 0}</b>
                        </span>
                        <span className={`${chipBase} ${chipColor}`}>
                          Category: <b>{a.allocationCategory || "Uncategorized"}</b>
                        </span>
                      </div>
                      {a.allocationId && (
                        <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                          <span className={`${chipBase} ${chipColor}`}>
                            Notes: <b>{a.allocationId}</b>
                          </span>
                        </div>
                      )}
                      {showAssetMetaSection && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assetMetaFields.map(({ key, label, value, field }) => {
                            const isCopied = copiedMetaKey === key;
                            const tooltipText = isCopied ? "Copied!" : "Click to copy value";
                            const tooltipToneClasses = isCopied
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-900 text-white";
                            return (
                              <button
                                key={key}
                                type="button"
                                className={`${copyChipClasses} ${copyChipTruncate} flex flex-col items-start gap-1`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyAssetField(field, value, key);
                                }}
                                aria-label={`Copy ${label}`}
                                title={tooltipText}
                              >
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
                                <span className="text-sm font-semibold">{value}</span>
                                <span
                                  className={`pointer-events-none absolute left-1/2 -top-8 -translate-x-1/2 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-opacity duration-150 shadow-lg ${tooltipToneClasses} ${isCopied ? "opacity-100" : "opacity-0 group-hover:opacity-100"} z-10`}
                                  aria-live={isCopied ? "polite" : undefined}
                                >
                                  {tooltipText}
                                </span>
                             </button>
                            );
                          })}
                        </div>
                      )}
                      {isSyntheticPendingCard && (
                        <div className="text-xs text-amber-700 mt-2">
                          This entry represents {a.qty ?? 0} units still awaiting allocation.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
