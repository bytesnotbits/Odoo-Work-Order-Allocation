export const normalizeSerialKey = (value) => String(value || "").trim().toLowerCase();
export const REEL_OVERLAP_TOLERANCE = 1e-9;

export function intervalsOverlap(aStart, aEnd, bStart, bEnd, tolerance = REEL_OVERLAP_TOLERANCE) {
  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    return false;
  }
  const startA = Math.min(aStart, aEnd);
  const endA = Math.max(aStart, aEnd);
  const startB = Math.min(bStart, bEnd);
  const endB = Math.max(bStart, bEnd);
  if (endA <= startA || endB <= startB) return false;
  return Math.min(endA, endB) - Math.max(startA, startB) > tolerance;
}

export function normalizeReelBounds(outer, inner) {
  const o = Number(outer);
  const i = Number(inner);
  if (!Number.isFinite(o) || !Number.isFinite(i)) return null;
  const start = Math.min(o, i);
  const end = Math.max(o, i);
  if (start === end) return null;
  return { start, end, outer: o, inner: i };
}

export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals)) return [];
  const sorted = [...intervals].filter(
    (range) => range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < range.end,
  ).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of sorted) {
    if (merged.length === 0) {
      merged.push({ start: interval.start, end: interval.end });
      continue;
    }
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

export function computeSpanGaps(span, intervals) {
  if (
    !span ||
    !Number.isFinite(span.start) ||
    !Number.isFinite(span.end) ||
    span.end <= span.start
  ) {
    return [];
  }
  const normalizedSpan = { start: span.start, end: span.end };
  const clipped = (Array.isArray(intervals) ? intervals : []).map((interval) => ({
    start: Math.max(normalizedSpan.start, Math.min(interval.start, interval.end)),
    end: Math.min(normalizedSpan.end, Math.max(interval.start, interval.end)),
  })).filter((interval) => interval.end > interval.start);
  const merged = mergeIntervals(clipped);
  const gaps = [];
  let cursor = normalizedSpan.start;
  for (const interval of merged) {
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start });
    }
    cursor = Math.max(cursor, interval.end);
    if (cursor >= normalizedSpan.end) break;
  }
  if (cursor < normalizedSpan.end) {
    gaps.push({ start: cursor, end: normalizedSpan.end });
  }
  return gaps;
}

export function collectReelIntervals(allocations, reelSerial, predicate = () => true) {
  if (!Array.isArray(allocations)) return [];
  const serialKey = normalizeSerialKey(reelSerial);
  return allocations
    .filter((alloc) => alloc?.type === "reel")
    .filter((alloc) => {
      if (!serialKey.trim()) return true;
      return normalizeSerialKey(alloc.reelSerial) === serialKey;
    })
    .filter(predicate)
    .map((alloc) => normalizeReelBounds(alloc.outer, alloc.inner))
    .filter(Boolean)
    .map(({ start, end }) => ({ start, end }));
}

export function isPendingAllocation(allocation) {
  if (!allocation) return false;
  return (String(allocation.allocationCategory || "").trim().toLowerCase()) === "pending";
}
