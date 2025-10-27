import { useState } from "react";
import { uid } from "../lib/uid";

export function useAllocations(grouped) {
  // { "WO|CODE": { allocations: [], assets: {}, reels: {}, locked: bool } }
  const [allocState, setAllocState] = useState({});

  const keyOf = (wo, code) => `${wo}|${code}`;

  const getItemState = (wo, code) => {
    const base = grouped.get(wo)?.get(code);
    const k = keyOf(wo, code);
    const extra = allocState[k] || { allocations: [], assets: {}, locked: false };
    const posted = base?.posted || 0;
    const returned = base?.returned || 0;
    const totalAvailable = Math.max(posted - returned, 0);
    const allocatedSum = extra.allocations.reduce((s, a) => {
      const cat = (a.allocationCategory || "").toLowerCase();
      const isCustom = cat === "custom" || cat === "__custom__";
      if (isCustom) return s; // skip counting custom allocations
      return s + (a.type === "reel" ? a.footage : a.qty);
    }, 0);    const remaining = Math.max(totalAvailable - allocatedSum, 0);
    return { base, extra, totalAvailable, allocatedSum, remaining, overAllocated: allocatedSum > totalAvailable };
  };

  const upsertAllocation = (wo, code, alloc) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {} };
      return { ...prev, [k]: { ...cur, allocations: [...cur.allocations, { id: uid(), ...alloc }] } };
    });
  };

  const removeAllocation = (wo, code, id) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {} };
      return { ...prev, [k]: { ...cur, allocations: cur.allocations.filter(a => a.id !== id) } };
    });
  };

  const setAssetId = (wo, code, allocId, assetId) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {} };
      return { ...prev, [k]: { ...cur, assets: { ...cur.assets, [allocId]: assetId } } };
    });
  };

  // Reel spans
  const setReelSpan = (wo, code, reelSerial, start, end) => {
    setAllocState(prev => {
      const k = keyOf(wo, code);
      const cur = prev[k] || { allocations: [], assets: {}, locked: false, reels: {} };
      return { ...prev, [k]: { ...cur, reels: { ...(cur.reels || {}), [reelSerial]: { start, end } } } };
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

  // Validation + lock
  const lockWorkOrder = (wo) => {
    const gm = grouped.get(wo);
    if (!gm) return;

    const issues = [];

    // (1) over / unallocated
    for (const [code] of gm) {
      const s = getItemState(wo, code);
      if (s.allocatedSum > s.totalAvailable) {
        issues.push(`Over-allocated on [${code}]: allocations (${s.allocatedSum}) exceed available (${s.totalAvailable}).`);
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

    // (3) asset IDs
    for (const [code] of gm) {
      const k = keyOf(wo, code);
      const state = allocState[k] || { allocations: [], assets: {} };
      for (const a of state.allocations) {
        if (!state.assets[a.id]) issues.push(`Missing Asset ID on [${code}] for allocation ${a.id}.`);
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
    setAssetId,
    setReelSpan,
    getReelSpan,
    listReels,
    lockWorkOrder,
  };
}