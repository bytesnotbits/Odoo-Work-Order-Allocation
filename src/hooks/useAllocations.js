import { useState } from "react";
import { MISC_PRODUCT_CODE, isMiscProductCode } from "../lib/data";
import { uid } from "../lib/uid";
import { normalizeReelBounds } from "../lib/reelSpans";

export function useAllocations(grouped) {
  // { "WO|CODE": { allocations: [], assets: { [allocId]: string | {assetId, coeLoc, rackBay, sepcat} }, reels: {}, locked: bool, cableMode: bool } }
  const [allocState, setAllocState] = useState({});

  const keyOf = (wo, code) => `${wo}|${code}`;

  const normalizeSerial = (value) => String(value || "").trim();

  const normalizeReelSpan = (span) => {
    const bounds = normalizeReelBounds(span?.start ?? span?.outer, span?.end ?? span?.inner);
    if (!bounds) return null;
    return {
      id: span?.id || span?.spanId || uid(),
      start: bounds.start,
      end: bounds.end,
      showOnChargeout: !!span?.showOnChargeout,
      chargeoutStatus: span?.chargeoutStatus ?? null,
    };
  };

  const normalizeReelSpanRecords = (reels = {}) => {
    const normalized = {};
    if (!reels || typeof reels !== "object") return normalized;
    for (const [serial, value] of Object.entries(reels)) {
      const key = normalizeSerial(serial);
      if (!key) continue;
      const spans = [];
      if (Array.isArray(value)) {
        for (const span of value) {
          const normalizedSpan = normalizeReelSpan(span);
          if (normalizedSpan) spans.push(normalizedSpan);
        }
      } else if (value && typeof value === "object") {
        const normalizedSpan = normalizeReelSpan(value);
        if (normalizedSpan) spans.push(normalizedSpan);
      }
      if (spans.length > 0) {
        normalized[key] = spans;
      }
    }
    return normalized;
  };

  const buildReelState = (input) => ({
    allocations: input.allocations || [],
    assets: input.assets || {},
    locked: input.locked || false,
    reels: input.reels || {},
    coe: input.coe || {},
    cableMode: input.cableMode || false,
    chargeouts: input.chargeouts || {},
  });

  const getReelSpanMap = (wo, code) => {
    const k = keyOf(wo, code);
    const rec = allocState[k] || {};
    return normalizeReelSpanRecords(rec.reels || {});
  };

  const listReelSpans = (wo, code, reelSerial) => {
    const spans = getReelSpanMap(wo, code);
    const serialKey = normalizeSerial(reelSerial);
    if (!serialKey) return [];
    return spans[serialKey] || [];
  };

  const getItemState = (wo, code) => {
    const base = grouped.get(wo)?.get(code);
    const k = keyOf(wo, code);
    const extra = buildReelState(allocState[k] || {});
    const isMisc = isMiscProductCode(code);
    const posted = base?.posted || 0;
    const returned = base?.returned || 0;
    const totalAvailable = Math.max(posted, 0);
    const allocationAmount = (alloc) => {
      if (alloc.type === "reel") {
        if (Number.isFinite(alloc.footage)) return Math.abs(alloc.footage);
        if (alloc.outer != null && alloc.inner != null) {
          const o = Number(alloc.outer);
          const i = Number(alloc.inner);
          if (Number.isFinite(o) && Number.isFinite(i)) {
            return Math.abs(o - i);
          }
        }
        return 0;
      }
      return Number(alloc.qty) || 0;
    };

    const totals = extra.allocations.reduce(
      (acc, alloc) => {
        const amount = allocationAmount(alloc);
        if (alloc.allocationCategoryIsCustom) return acc;
        if (alloc.allocationCategory === "Pending") {
          acc.pending += amount;
          return acc;
        }
        if (alloc.allocationCategory === "Returned") {
          acc.returned += amount;
          return acc;
        }
        if (alloc.allocationCategory === "Expense") {
          acc.expense += amount;
          return acc;
        }
        acc.installed += amount;
        return acc;
      },
      { installed: 0, pending: 0, returned: 0, expense: 0 }
    );

    const allocatedSum = totals.installed;
    const returnedSum = totals.returned;
    const pendingReturnSum = totals.pending;
    const netAllocated = allocatedSum;
    const remaining = Math.max(totalAvailable - netAllocated, 0);
    const finalTotalAvailable = isMisc ? 0 : totalAvailable;
    const finalRemaining = isMisc ? 0 : remaining;
    const overAllocated = isMisc ? false : netAllocated > totalAvailable;
    return {
      base,
      extra,
      totalAvailable: finalTotalAvailable,
      allocatedSum,
      pendingReturnSum,
      returnedSum,
      netAllocated,
      remaining: finalRemaining,
      overAllocated,
      cableMode: extra.cableMode || false,
      cableSuggested: !!base?.isCable,
      isMisc,
    };
  };

  const upsertAllocation = (wo, code, alloc, assetMeta = null) => {
    const newAlloc = { id: uid(), ...alloc };
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const updatedAssets = { ...cur.assets };
      if (assetMeta && typeof assetMeta === "object" && Object.keys(assetMeta).length > 0) {
        const previousMeta = typeof updatedAssets[newAlloc.id] === "object"
          ? updatedAssets[newAlloc.id]
          : { assetId: "", coeLoc: "", rackBay: "", sepcat: "" };
        updatedAssets[newAlloc.id] = { ...previousMeta, ...assetMeta };
      }
      return { ...prev, [k]: { ...cur, allocations: [...cur.allocations, newAlloc], assets: updatedAssets } };
    });
    return newAlloc.id;
  };

  const removeAllocation = (wo, code, id) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const { [id]: _, ...restCoe } = cur.coe || {};
      return { ...prev, [k]: { ...cur, allocations: cur.allocations.filter(a => a.id !== id), coe: restCoe } };
    });
  };

  // Back-compat helper: keep setAssetId but store as object
  const setAssetId = (wo, code, allocId, assetId) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const prevMeta = cur.assets?.[allocId];
      const meta = typeof prevMeta === 'object'
        ? { ...prevMeta, assetId }
        : { assetId, coeLoc: '', rackBay: '', sepcat: '' };
      return { ...prev, [k]: { ...cur, assets: { ...cur.assets, [allocId]: meta } } };
    });
  };

  // New: set any subset of asset meta fields
  const setAssetMeta = (wo, code, allocId, fields) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const prevMeta = cur.assets?.[allocId];
      const base = (typeof prevMeta === 'object')
        ? prevMeta
        : { assetId: (prevMeta ?? ''), coeLoc: '', rackBay: '', sepcat: '' };
      return { ...prev, [k]: { ...cur, assets: { ...cur.assets, [allocId]: { ...base, ...fields } } } };
    });
  };

  // Reel spans
  const setReelSpan = (wo, code, reelSerial, start, end, options = {}) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial) return null;
    const bounds = normalizeReelBounds(start, end);
    if (!bounds) return null;
    const spanId = options.spanId || uid();
    let createdSpan = null;
    setAllocState((prev) => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const normalized = normalizeReelSpanRecords(cur.reels);
      const existing = normalized[normalizedSerial] || [];
      const existingSpan = options.spanId ? existing.find((span) => span.id === spanId) : null;
      const newSpan = {
        id: spanId,
        start: bounds.start,
        end: bounds.end,
        showOnChargeout:
          typeof options.showOnChargeout === "boolean"
            ? options.showOnChargeout
            : existingSpan?.showOnChargeout || false,
        chargeoutStatus:
          options.chargeoutStatus ?? existingSpan?.chargeoutStatus ?? null,
      };
      createdSpan = newSpan;
      const updated = options.spanId
        ? existing.map((span) => (span.id === spanId ? newSpan : span))
        : [...existing, newSpan];
      return {
        ...prev,
        [k]: {
          ...cur,
          reels: {
            ...normalized,
            [normalizedSerial]: updated,
          },
        },
      };
    });
    return createdSpan;
  };
  const removeReelSpan = (wo, code, reelSerial) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial) return;
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const normalized = normalizeReelSpanRecords(cur.reels);
      if (!normalized[normalizedSerial]) return prev;
      const { [normalizedSerial]: _, ...remaining } = normalized;
      return { ...prev, [k]: { ...cur, reels: remaining } };
    });
  };

  const removeReelSpanEntry = (wo, code, reelSerial, spanId) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial || !spanId) return;
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const normalized = normalizeReelSpanRecords(cur.reels);
      const existing = normalized[normalizedSerial] || [];
      const filtered = existing.filter((span) => span.id !== spanId);
      if (filtered.length === existing.length) return prev;
      const updated = filtered.length > 0
        ? { ...normalized, [normalizedSerial]: filtered }
        : Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== normalizedSerial));
      return { ...prev, [k]: { ...cur, reels: updated } };
    });
  };
  const updateReelSpan = (wo, code, reelSerial, spanId, updates = {}) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial || !spanId) return;
    setAllocState((prev) => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const normalized = normalizeReelSpanRecords(cur.reels);
      const existing = normalized[normalizedSerial] || [];
      let found = false;
      const updated = existing.map((span) => {
        if (span.id !== spanId) return span;
        found = true;
        return { ...span, ...updates };
      });
      if (!found) return prev;
      return {
        ...prev,
        [k]: {
          ...cur,
          reels: {
            ...normalized,
            [normalizedSerial]: updated,
          },
        },
      };
    });
  };
  const setSpanChargeoutVisibility = (wo, code, reelSerial, spanId, visible) =>
    updateReelSpan(wo, code, reelSerial, spanId, { showOnChargeout: !!visible });
  const getReelSpan = (wo, code, reelSerial, spanId) => {
    const spans = listReelSpans(wo, code, reelSerial);
    if (!spans.length) return { start: "", end: "" };
    if (spanId) {
      const match = spans.find((span) => span.id === spanId);
      if (match) return match;
    }
    return spans[spans.length - 1];
  };
  const listReels = (wo, code) => Object.keys(getReelSpanMap(wo, code));
  const getReelChargeout = (wo, code, reelSerial) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial) return {};
    const k = keyOf(wo, code);
    const rec = buildReelState(allocState[k] || {});
    return rec.chargeouts?.[normalizedSerial] || {};
  };
  const setReelChargeout = (wo, code, reelSerial, updates) => {
    const normalizedSerial = normalizeSerial(reelSerial);
    if (!normalizedSerial || !updates || typeof updates !== "object") return;
    setAllocState((prev) => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      const nextChargeouts = {
        ...cur.chargeouts,
        [normalizedSerial]: {
          ...cur.chargeouts[normalizedSerial],
          ...updates,
        },
      };
      return { ...prev, [k]: { ...cur, chargeouts: nextChargeouts } };
    });
  };

  const setCableMode = (wo, code, enabled) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = buildReelState(prev[k] || {});
      return { ...prev, [k]: { ...cur, cableMode: !!enabled } };
    });
  };

  const resetItem = (wo, code) => {
    if (!wo || !code) return;
    setAllocState((prev) => {
      const k = keyOf(wo, code);
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  // Validation + lock
  const lockWorkOrder = (wo) => {
    const gm = grouped.get(wo);
    if (!gm) return;

    const issues = [];

    // (1) over / unallocated
    for (const [code] of gm) {
      if (isMiscProductCode(code)) continue;
      const s = getItemState(wo, code);
      if (s.netAllocated > s.totalAvailable) {
        issues.push(`Over-allocated on [${code}]: allocations (${s.netAllocated}) exceed available (${s.totalAvailable}).`);
      }
      if (s.remaining > 0) {
        issues.push(`Unallocated material on [${code}]: remaining ${s.remaining}.`);
      }
    }

    // (2) reel overlaps + span bounds per reel
    for (const [code] of gm) {
      if (isMiscProductCode(code)) continue;
      const k = keyOf(wo, code);
      const rec = buildReelState(allocState[k] || {});
      const byReel = {};
      for (const a of rec.allocations) {
        if (a.type !== "reel") continue;
        const reel = a.reelSerial || "(no reel)";
        const s = Math.min(a.outer, a.inner);
        const e = Math.max(a.outer, a.inner);
        if (!byReel[reel]) byReel[reel] = [];
        byReel[reel].push([s, e]);
      }
      for (const reel of Object.keys(byReel)) {
        const intervals = byReel[reel].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
        for (let i = 1; i < intervals.length; i++) {
          const prev = intervals[i - 1];
          const curr = intervals[i];
          if (curr[0] < prev[1]) {
            issues.push(`Overlap on [${code}] reel ${reel}: [${prev[0]}–${prev[1]}] overlaps [${curr[0]}–${curr[1]}].`);
          }
        }
        const spans = normalizeReelSpanRecords(rec.reels || {})[reel] || [];
        if (spans.length > 0) {
          for (const [s, e] of intervals) {
            const fits = spans.some(({ start, end }) => s >= start && e <= end);
            if (!fits) {
              const spanDesc = spans.map(({ start, end }) => `[${start}–${end}]`).join(" or ");
              issues.push(
                `Piece outside saved span on [${code}] reel ${reel}: [${s}–${e}] not within ${spanDesc}.`,
              );
            }
          }
        }
      }
    }

    // (3) asset IDs (and SCXR-only COE field validation)
    for (const [code] of gm) {
      if (isMiscProductCode(code)) continue;
      const k = keyOf(wo, code);
      const state = buildReelState(allocState[k] || {});
      // determine SCXR from grouped data
      const base = grouped.get(wo)?.get(code);
      const baseGroup = String(base?.group || '').trim().toUpperCase();
      const isSCXR = baseGroup.includes('SCXR');
    for (const a of state.allocations) {
      if (!isSCXR) continue;
      const v = state.assets[a.id];
      const meta = typeof v === 'object'
        ? v
        : { assetId: v ?? "", coeLoc: "", rackBay: "", sepcat: "" };
      const missing = [];
      if (!meta.coeLoc)  missing.push("COE LOC");
      if (!meta.rackBay) missing.push("RACK/BAY");
      if (!meta.sepcat)  missing.push("SEPCAT");
      if (missing.length) {
        issues.push(`SCXR requires ${missing.join(", ")} on [${code}] allocation ${a.id}.`);
      }
    }
    }

    if (issues.length) {
      alert(`Cannot complete WO ${wo} due to:\n\n• ${issues.join("\n• ")}`);
      return;
    }

    // lock
    setAllocState(prev => {
      const next = { ...prev };
      for (const [code] of gm) {
        const k = keyOf(wo, code);
        if (next[k]) next[k] = { ...next[k], locked: true };
      }
      return next;
    });
    alert(`WO ${wo} marked complete.`);
  };

  const splitPendingReturnAllocations = (allocations, interval, reelSerialKey) => {
    const updated = [];
    const removedIds = [];
    for (const alloc of allocations) {
      const serialKey = (alloc.reelSerial || "");
      if (
        alloc.type !== "reel" ||
        serialKey !== reelSerialKey ||
        alloc.allocationCategory !== "Pending"
      ) {
        updated.push(alloc);
        continue;
      }
      const bounds = normalizeReelBounds(alloc.outer, alloc.inner);
      if (!bounds) {
        updated.push(alloc);
        continue;
      }
      const overlapStart = Math.max(bounds.start, interval.start);
      const overlapEnd = Math.min(bounds.end, interval.end);
      if (overlapStart >= overlapEnd) {
        updated.push(alloc);
        continue;
      }
      removedIds.push(alloc.id);
      const template = { ...alloc };
      delete template.id;
      if (bounds.start < overlapStart) {
        updated.push({
          ...template,
          id: uid(),
          outer: overlapStart,
          inner: bounds.start,
          footage: Math.abs(overlapStart - bounds.start),
        });
      }
      if (overlapEnd < bounds.end) {
        updated.push({
          ...template,
          id: uid(),
          outer: bounds.end,
          inner: overlapEnd,
          footage: Math.abs(bounds.end - overlapEnd),
        });
      }
    }
    return { allocations: updated, removedIds };
  };

  const detectReelOverlap = (allocations, reelSerialKey) => {
    const intervals = allocations
      .filter((alloc) => alloc.type === "reel" && (alloc.reelSerial || "") === reelSerialKey)
      .map((alloc) => {
        const bounds = normalizeReelBounds(alloc.outer, alloc.inner);
        return bounds ? { ...bounds, id: alloc.id } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < intervals.length; i += 1) {
      if (intervals[i].start < intervals[i - 1].end) {
        return { previous: intervals[i - 1], current: intervals[i] };
      }
    }
    return null;
  };

  const addReelAllocation = (wo, code, alloc, options = {}) => {
    const bounds = normalizeReelBounds(alloc.outer, alloc.inner);
    if (!bounds) {
      return { error: "Enter valid outer/inner to compute footage" };
    }
    const reelSerialKey = (alloc.reelSerial || "");
    const k = keyOf(wo, code);
    const current = buildReelState(allocState[k] || {});
    const { replaceId, assetMeta } = options || {};
    const { allocations: staged, removedIds } = splitPendingReturnAllocations(
      current.allocations,
      { start: bounds.start, end: bounds.end },
      reelSerialKey
    );
    const newAlloc = {
      id: replaceId || uid(),
      ...alloc,
      outer: bounds.outer,
      inner: bounds.inner,
      footage: Math.abs(bounds.end - bounds.start),
    };
    const filteredStaged = replaceId
      ? staged.filter((alloc) => alloc.id !== replaceId)
      : staged;
    const candidateAllocations = [...filteredStaged, newAlloc];
    const overlap = detectReelOverlap(candidateAllocations, reelSerialKey);
    if (overlap) {
      return { error: `Overlap with existing piece [${overlap.previous.start}–${overlap.previous.end}]` };
    }
    setAllocState((prev) => {
      const cur = buildReelState(prev[k] || {});
      const adjustedAssets = { ...cur.assets };
      if (assetMeta && typeof assetMeta === "object" && Object.keys(assetMeta).length > 0) {
        const previousMeta = typeof adjustedAssets[newAlloc.id] === "object"
          ? adjustedAssets[newAlloc.id]
          : { assetId: "", coeLoc: "", rackBay: "", sepcat: "" };
        adjustedAssets[newAlloc.id] = { ...previousMeta, ...assetMeta };
      }
      const adjustedCoe = { ...(cur.coe || {}) };
      for (const id of removedIds) {
        if (id === newAlloc.id) continue;
        if (adjustedAssets[id] !== undefined) delete adjustedAssets[id];
        if (adjustedCoe[id] !== undefined) delete adjustedCoe[id];
      }
      return {
        ...prev,
        [k]: {
          ...cur,
          allocations: candidateAllocations,
          assets: adjustedAssets,
          coe: adjustedCoe,
        },
      };
    });
    return { success: true, id: newAlloc.id };
  };

  const updateAllocation = (wo, code, allocId, fields) => {
    setAllocState((prev) => {
      const k = keyOf(wo, code);
      const cur = prev[k];
      if (!cur) return prev;
      const normalized = buildReelState(cur);
      const allocations = normalized.allocations.map((a) =>
        a.id === allocId ? { ...a, ...fields } : a
      );
      return { ...prev, [k]: { ...cur, allocations } };
    });
  };

  return {
    allocState,
    setAllocState,
    keyOf,
    getItemState,
    upsertAllocation,
    removeAllocation,
    setCableMode,
    setAssetId,
    setAssetMeta,
    setReelSpan,
    removeReelSpan,
    getReelSpan,
    listReels,
    getReelSpanMap,
    getReelChargeout,
    setReelChargeout,
    listReelSpans,
    lockWorkOrder,
    addReelAllocation,
    updateAllocation,
    removeReelSpanEntry,
    updateReelSpan,
    setSpanChargeoutVisibility,
    resetItem,
  };
}
