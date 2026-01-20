import { useMemo, useState } from "react";

const STATUS_OPTIONS = [
  "Pending Charge",
  "Ready for Review",
  "Pending Review",
  "Ready to Post",
  "Ok to Post",
];

const formatFootage = (value) => (Number.isFinite(value) ? value.toFixed(2) : "0.00");

const ALLOWED_CHARGEOUT_CATEGORIES = new Set([
  "aerial",
  "buried",
  "underground",
  "expense",
]);

export default function CableReelChargeoutPrototype({
  workOrder,
  grouped = new Map(),
  listReels = () => [],
  listReelSpans = () => [],
  getReelChargeout = () => ({}),
  setReelChargeout = () => {},
  getItemState = () => null,
}) {
  const [activeStatus, setActiveStatus] = useState(STATUS_OPTIONS[0]);
  const [readyAction, setReadyAction] = useState("Awaiting review");
  const [notes, setNotes] = useState(
    "Cable ready for review once the spans are confirmed in the field.",
  );

  const reelRows = useMemo(() => {
    if (!workOrder || !grouped.has(workOrder)) return [];
    const rows = [];
    const products = grouped.get(workOrder) || new Map();
    for (const [code, item] of products.entries()) {
      const reels = listReels(workOrder, code) || [];
      reels.forEach((reelNumber) => {
        const spans = listReelSpans(workOrder, code, reelNumber);
        const boundedSpans = spans.filter(
          (span) => span?.start != null && span?.end != null && span.end > span.start,
        );
        const state = getItemState(workOrder, code);
        const allocations = state?.extra?.allocations || [];
        const matchingAllocations = allocations
          .filter(
            (alloc) =>
              alloc?.type === "reel" &&
              ALLOWED_CHARGEOUT_CATEGORIES.has(
                String(alloc.allocationCategory || "").trim().toLowerCase(),
              ),
          )
          .map((alloc) => {
            const start = Number(alloc.start ?? alloc.inner ?? alloc.outer);
            const end = Number(alloc.end ?? alloc.outer ?? alloc.inner);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return alloc.spanId ? { id: alloc.spanId } : null;
            const normalized = start <= end ? { start, end } : { start: end, end: start };
            return {
              ...alloc,
              spanId: alloc.spanId,
              normalized,
            };
          })
          .filter(Boolean);
        const allowedSpanIds = new Set(matchingAllocations.map((alloc) => alloc.spanId).filter(Boolean));
        const allowedRanges = new Set(
          matchingAllocations
            .map((alloc) => alloc.normalized)
            .filter(Boolean)
            .map((range) => `${range.start}:${range.end}`),
        );
        const matchesRange = (span) => {
          const key = `${span.start}:${span.end}`;
          return allowedRanges.has(key);
        };
        const chargeoutSpans = boundedSpans.filter(
          (span) => allowedSpanIds.has(span.id) || matchesRange(span),
        );
        if (chargeoutSpans.length === 0) return;
        const lengthSum = chargeoutSpans.reduce((sum, span) => sum + (span.end - span.start), 0);
        const outerSeq =
          chargeoutSpans.length > 0
            ? Math.min(...chargeoutSpans.map((span) => span.start))
            : "";
        const innerSeq =
          chargeoutSpans.length > 0
            ? Math.max(...chargeoutSpans.map((span) => span.end))
            : "";
        const chargeout = getReelChargeout(workOrder, code, reelNumber) || {};
        rows.push({
          code,
          description: item?.desc || "",
          reelNumber,
          outerSeq,
          innerSeq,
          totalLength: lengthSum,
          spans: chargeoutSpans,
          journalLine: chargeout.journalLine || "",
          reference: chargeout.reference || "",
          submitted: !!chargeout.submitted,
        });
      });
    }
    return rows;
  }, [workOrder, grouped, listReels, listReelSpans, getReelChargeout, getItemState]);

  const totalsByReel = useMemo(() => {
    const map = {};
    reelRows.forEach((row) => {
      map[row.reelNumber] = {
        quantity: row.totalLength,
        length: row.totalLength,
        code: row.code,
        description: row.description,
      };
    });
    return map;
  }, [reelRows]);

  const aggregateTotals = useMemo(
    () =>
      Object.values(totalsByReel).reduce(
        (acc, summary) => ({
          quantity: acc.quantity + summary.quantity,
          length: acc.length + summary.length,
        }),
        { quantity: 0, length: 0 },
      ),
    [totalsByReel],
  );

  const journalEntries = useMemo(
    () =>
      reelRows.map((row) => ({
        reelNumber: row.reelNumber,
        line: row.journalLine || "Waiting for entry",
        reference: row.reference || "Waiting for entry",
        note: row.submitted ? "Submitted" : "Pending signoff",
      })),
    [reelRows],
  );

  const handleChargeoutChange = (row, field) => (event) => {
    if (!workOrder) return;
    setReelChargeout(workOrder, row.code, row.reelNumber, {
      [field]: event.target.value,
    });
  };

  const hasReels = reelRows.length > 0;

  return (
    <div className="space-y-6 text-sm text-slate-700">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work Order</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {workOrder || "No work order selected"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Engineer</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">A. Rios</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date &amp; Time</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">05/14/2025 09:18</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Chargeout Status</span>
            <span className="text-[11px] font-normal text-slate-400">Updated live</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setActiveStatus(option)}
                className={`rounded-2xl px-3 py-1 text-xs font-semibold transition ${
                  option === activeStatus
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">Current: {activeStatus}</div>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Cable Reel Details</h3>
            <p className="text-xs text-slate-500">Material Management only fills out the journal details.</p>
          </div>
          <button
            type="button"
            onClick={() => setReadyAction((prev) => (prev === "Awaiting review" ? "Ready for Review" : "Awaiting review"))}
            className="rounded-2xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
          >
            {readyAction}
          </button>
        </div>
        {hasReels ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Item #",
                    "Reel #",
                    "Item Description",
                    "Inner Seq",
                    "Outer Seq",
                    "Qty (derived from spans)",
                    "NISC Line #",
                    "Reference",
                  ].map((label) => (
                    <th key={label} className="px-3 py-2 font-normal text-slate-500">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reelRows.map((row) => (
                  <tr key={row.reelNumber} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.code}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.reelNumber}
                      {row.submitted && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Submitted
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.description}</td>
                    <td className="px-3 py-2 text-slate-600">{row.innerSeq}</td>
                    <td className="px-3 py-2 text-slate-600">{row.outerSeq}</td>
                    <td className="px-3 py-2 text-slate-600">{formatFootage(row.totalLength)} ft</td>
                    <td className="px-3 py-2 text-slate-600">
                      <input
                        type="text"
                        value={row.journalLine}
                        onChange={handleChargeoutChange(row, "journalLine")}
                        className="w-24 rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-900 focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <input
                        type="text"
                        value={row.reference}
                        onChange={handleChargeoutChange(row, "reference")}
                        className="w-28 rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-900 focus:ring-0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            No reel spans have been captured yet. Create spans in the allocation form so this view can pull from them.
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Cable Spans by Reel</h3>
        {hasReels ? (
          reelRows.map((row) => (
            <div key={`spans-${row.reelNumber}`} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Reel {row.reelNumber}</span>
                <span>Total length: {formatFootage(row.totalLength)} ft</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      {["Span ID", "From", "To", "Length (ft)", "Quantity", "Comments"].map((label) => (
                        <th key={`${row.reelNumber}-${label}`} className="px-3 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {row.spans.map((span) => (
                      <tr key={`${row.reelNumber}-${span.id}`}>
                        <td className="px-3 py-2 text-slate-700">{span.id}</td>
                        <td className="px-3 py-2 text-slate-700">{span.start}</td>
                        <td className="px-3 py-2 text-slate-700">{span.end}</td>
                        <td className="px-3 py-2 text-slate-700">{formatFootage(span.end - span.start)}</td>
                        <td className="px-3 py-2 text-slate-700">1</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Optional comment"
                            className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-slate-900 focus:ring-0"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            Spans are the single source of truth for reel geometry. Allocate spans in the engineering view before charging.
          </div>
        )}
        {hasReels && (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 text-slate-600">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Totals per reel</div>
                <div className="text-base font-semibold text-slate-900">
                  {Object.entries(totalsByReel).map(([reelNumber, summary]) => (
                    <span key={`total-${reelNumber}`} className="mr-4">
                      {reelNumber}: {formatFootage(summary.quantity)} qty · {formatFootage(summary.length)} ft
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-500">Each reel is billed independently.</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400">Grand Totals</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {formatFootage(aggregateTotals.quantity)} qty · {formatFootage(aggregateTotals.length)} ft
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-slate-900 focus:ring-0"
          />
          <div className="mt-2 text-xs text-slate-500">Reviewer notes or load-in instructions.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Digital Signoffs</div>
              <div className="text-sm font-semibold text-slate-900">Engineer → Material Mgmt</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-[11px] font-semibold text-emerald-700">Auto-logged</span>
          </div>
          <div className="mt-3 space-y-3 text-xs text-slate-500">
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span>Engineer signed off</span>
              <span className="text-emerald-700">A. Rios · 09:18</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2">
              <span>Material Mgmt approval</span>
              <button
                type="button"
                className="text-xs font-semibold text-amber-700 underline-offset-4 hover:underline"
              >
                Capture signature
              </button>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Material is charged only after both approvals. Match these lines with the NISC Journal Entry for each reel.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-slate-900">Journal Entry Matching</summary>
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {journalEntries.length > 0 ? (
              journalEntries.map((entry) => (
                <div key={`${entry.reelNumber}-${entry.line}`} className="rounded-2xl border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">Reel {entry.reelNumber}</span>
                    <span className="text-xs font-semibold text-slate-500">{entry.reference}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm text-slate-900">Line {entry.line}</span>
                    <span className="text-[11px] text-slate-500">{entry.note}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                No journal lines recorded yet—fill the top table to populate these entries.
              </div>
            )}
          </div>
        </details>
        <button
          type="button"
          className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
        >
          Save &amp; Send for Chargeout
        </button>
      </div>
    </div>
  );
}
