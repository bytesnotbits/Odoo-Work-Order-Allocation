import { useState } from "react";
import { uid } from "../lib/uid";

export function useAllocations(grouped) {
  // { "WO|CODE": { allocations: [], assets: { [allocId]: string | {assetId, coeLoc, rackBay, sepcat} }, reels: {}, locked: bool, cableMode: bool } }
  const [allocState, setAllocState] = useState({});

  const keyOf = (wo, code) => `${wo}|${code}`;

  const getItemState = (wo, code) => {
    const base = grouped.get(wo)?.get(code);
    const k = keyOf(wo, code);
    const extra = allocState[k] || { allocations: [], assets: {}, reels: {}, coe: {}, locked: false, cableMode: false };
    const posted = base?.posted || 0;
    const returned = base?.returned || 0;
    const totalAvailable = Math.max(posted - returned, 0);
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
        if (alloc.allocationCategory === "Pending return") {
          acc.pending += amount;
          return acc;
        }
        if (alloc.allocationCategory === "Returned") {
          acc.returned += amount;
          return acc;
        }
        acc.installed += amount;
        return acc;
      },
      { installed: 0, pending: 0, returned: 0 }
    );

    const allocatedSum = totals.installed;
    const returnedSum = totals.returned;
    const pendingReturnSum = totals.pending;
    const netAllocated = allocatedSum - returnedSum;
    const remaining = Math.max(totalAvailable - netAllocated, 0);
    return {
      base,
      extra,
      totalAvailable,
      allocatedSum,
      pendingReturnSum,
      returnedSum,
      netAllocated,
      remaining,
      overAllocated: netAllocated > totalAvailable,
      cableMode: extra.cableMode || false,
      cableSuggested: !!base?.isCable,
    };
  };

  const upsertAllocation = (wo, code, alloc) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, coe: {}, cableMode: false };
      return { ...prev, [k]: { ...cur, allocations: [...cur.allocations, { id: uid(), ...alloc }] } };
    });
  };

  const removeAllocation = (wo, code, id) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, coe: {}, cableMode: false };
      const { [id]: _, ...restCoe } = cur.coe || {};
      return { ...prev, [k]: { ...cur, allocations: cur.allocations.filter(a => a.id !== id), coe: restCoe } };
    });
  };

  // Back-compat helper: keep setAssetId but store as object
  const setAssetId = (wo, code, allocId, assetId) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, cableMode: false };
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
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, cableMode: false };
      const prevMeta = cur.assets?.[allocId];
      const base = (typeof prevMeta === 'object')
        ? prevMeta
        : { assetId: (prevMeta ?? ''), coeLoc: '', rackBay: '', sepcat: '' };
      return { ...prev, [k]: { ...cur, assets: { ...cur.assets, [allocId]: { ...base, ...fields } } } };
    });
  };

  // Reel spans
  const setReelSpan = (wo, code, reelSerial, start, end) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, cableMode: false };
      return { ...prev, [k]: { ...cur, reels: { ...(cur.reels || {}), [reelSerial]: { start, end } } } };
    });
  };
  const removeReelSpan = (wo, code, reelSerial) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, cableMode: false };
      const { [reelSerial]: _, ...remaining } = cur.reels || {};
      return { ...prev, [k]: { ...cur, reels: remaining } };
    });
  };
  const getReelSpan = (wo, code, reelSerial) => {
    const k = keyOf(wo, code);
    const rec = allocState[k] || {};
    return (rec.reels && rec.reels[reelSerial]) ? rec.reels[reelSerial] : { start: "", end: "" };
  };
  const listReels = (wo, code) => {
    const k = keyOf(wo, code);
    const rec = allocState[k] || {};
    return Object.keys(rec.reels || {});
  };

  const setCableMode = (wo, code, enabled) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {}, coe: {}, cableMode: false };
      return { ...prev, [k]: { ...cur, cableMode: !!enabled } };
    });
  };

  // Validation + lock
  const lockWorkOrder = (wo) => {
    const gm = grouped.get(wo);
    if (!gm) return;

    const issues = [];

    // (1) over / unallocated
    for (const [code] of gm) {
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
      const k = keyOf(wo, code);
      const rec = allocState[k] || { allocations: [], reels: {} };
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
        const rs = (rec.reels || {})[reel];
        if (rs && Number.isFinite(Number(rs.start)) && Number.isFinite(Number(rs.end))) {
          const lo = Math.min(Number(rs.start), Number(rs.end));
          const hi = Math.max(Number(rs.start), Number(rs.end));
          for (const [s, e] of intervals) {
            if (s < lo || e > hi) {
              issues.push(`Piece outside saved span on [${code}] reel ${reel}: [${s}–${e}] not within [${lo}–${hi}].`);
            }
          }
        }
      }
    }

    // (3) asset IDs (and SCXR-only COE field validation)
    for (const [code] of gm) {
      const k = keyOf(wo, code);
      const state = allocState[k] || { allocations: [], assets: {} };
      // determine SCXR from grouped data
      const base = grouped.get(wo)?.get(code);
      const isSCXR = (base?.group || '') === 'SCXR';
      for (const a of state.allocations) {
        const v = state.assets[a.id];
        const assetId = typeof v === 'object' ? v.assetId : v;
        if (!assetId) issues.push(`Missing Asset ID on [${code}] for allocation ${a.id}.`);
        if (isSCXR) {
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
    lockWorkOrder,
  };
}
