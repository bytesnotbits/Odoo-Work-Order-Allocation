import { describe, expect, test } from "vitest";
import { normalizeReelBounds, collectReelIntervals, computeSpanGaps } from "../lib/reelSpans";

describe("reel span helpers", () => {
  test("normalizeReelBounds sorts and validates numeric endpoints", () => {
    expect(normalizeReelBounds(200, 100)).toEqual({ start: 100, end: 200, outer: 200, inner: 100 });
    expect(normalizeReelBounds("50", "150")).toEqual({ start: 50, end: 150, outer: 50, inner: 150 });
    expect(normalizeReelBounds(100, 100)).toBeNull();
    expect(normalizeReelBounds("foo", 100)).toBeNull();
  });

  test("collectReelIntervals filters by reel serial and predicate", () => {
    const allocations = [
      { type: "reel", reelSerial: "R1", allocationCategory: "Aerial", outer: 0, inner: 40 },
      { type: "reel", reelSerial: "R1", allocationCategory: "Pending", outer: 40, inner: 60 },
      { type: "reel", reelSerial: "R2", allocationCategory: "Aerial", outer: 100, inner: 140 },
    ];
    const filtered = collectReelIntervals(allocations, "R1", (alloc) => alloc.allocationCategory !== "Pending");
    expect(filtered).toEqual([{ start: 0, end: 40 }]);
  });

  test("computeSpanGaps returns uncovered intervals within a span", () => {
    const span = { start: 0, end: 100 };
    const coverage = [
      { start: -10, end: 10 },
      { start: 10, end: 30 },
      { start: 40, end: 60 },
      { start: 55, end: 75 },
      { start: 90, end: 110 },
    ];
    const gaps = computeSpanGaps(span, coverage);
    expect(gaps).toEqual([
      { start: 30, end: 40 },
      { start: 75, end: 90 },
    ]);
  });

  test("computeSpanGaps returns the full span when nothing covers it", () => {
    const span = { start: 0, end: 50 };
    const gaps = computeSpanGaps(span, []);
    expect(gaps).toEqual([{ start: 0, end: 50 }]);
  });

  test("computeSpanGaps returns empty array for invalid spans", () => {
    expect(computeSpanGaps(null, [])).toEqual([]);
    expect(computeSpanGaps({ start: 10, end: 10 }, [{ start: 5, end: 15 }])).toEqual([]);
  });
});
