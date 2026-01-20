import { useMemo, useState } from "react";

const CHARGEOUT_STATUS_PENDING = "Pending Charge";
const CHARGEOUT_STATUS_PENDING_REVIEW = "Pending Review";
const CHARGEOUT_STATUS_OK_TO_POST = "Ok to Post";
const CHARGEOUT_STATUS_POSTED = "Posted";

const STATUS_OPTIONS = [
  CHARGEOUT_STATUS_PENDING,
  CHARGEOUT_STATUS_PENDING_REVIEW,
  CHARGEOUT_STATUS_OK_TO_POST,
  CHARGEOUT_STATUS_POSTED,
];

const normalizeChargeoutStatus = (status) => status || CHARGEOUT_STATUS_PENDING;

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
  getReelChargeout = () => ({}),
  setReelChargeout = () => {},
  getItemState = () => null,
  updateAllocation = null,
}) {
  const [activeStatus, setActiveStatus] = useState(STATUS_OPTIONS[0]);
  const [readyAction, setReadyAction] = useState("Awaiting review");
  const [notes, setNotes] = useState(
    "Cable ready for review once the spans are confirmed in the field.",
  );
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [journalEntryInput, setJournalEntryInput] = useState("");
  const [postError, setPostError] = useState("");

  const reelRows = useMemo(() => {
    if (!workOrder || !grouped.has(workOrder)) return [];
    const rows = [];
    const products = grouped.get(workOrder) || new Map();
    for (const [code, item] of products.entries()) {
      const state = getItemState(workOrder, code);
      const allocations = state?.extra?.allocations || [];
      const flaggedAllocations = allocations
        .filter(
          (alloc) =>
            alloc?.type === "reel" &&
            alloc.chargeoutSelected &&
            ALLOWED_CHARGEOUT_CATEGORIES.has(
              String(alloc.allocationCategory || "").trim().toLowerCase(),
            ),
        )
        .map((alloc) => {
          const start = Number(alloc.start ?? alloc.inner ?? alloc.outer);
          const end = Number(alloc.end ?? alloc.outer ?? alloc.inner);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
          const normalized = start <= end ? { start, end } : { start: end, end: start };
          return {
            ...alloc,
            normalized,
          };
        })
        .filter(Boolean);
      const allocationsByReel = new Map();
      flaggedAllocations.forEach((alloc) => {
        const reelNumber = String(alloc.reelSerial || "").trim();
        if (!reelNumber) return;
        const list = allocationsByReel.get(reelNumber) || [];
        list.push(alloc);
        allocationsByReel.set(reelNumber, list);
      });
      for (const [reelNumber, reelAllocations] of allocationsByReel.entries()) {
        const chargeoutSpans = reelAllocations
          .map((alloc) => ({
            id: alloc.spanId || alloc.id,
            allocationId: alloc.id,
            start: alloc.normalized.start,
            end: alloc.normalized.end,
            chargeoutStatus: alloc.chargeoutStatus ?? null,
            chargeoutJournalEntry: alloc.chargeoutJournalEntry || "",
          }))
          .filter((span) => span.end > span.start);
        if (chargeoutSpans.length === 0) continue;
        const lengthSum = chargeoutSpans.reduce((sum, span) => sum + (span.end - span.start), 0);
        const chargeout = getReelChargeout(workOrder, code, reelNumber) || {};
        const chargeoutSpanStatuses = [
          ...new Set(
            chargeoutSpans
              .map((span) => normalizeChargeoutStatus(span.chargeoutStatus))
              .filter((status) => status && status !== ""),
          ),
        ];
        const chargeoutStatusLabel =
          chargeoutSpanStatuses.length > 0 ? chargeoutSpanStatuses.join(", ") : CHARGEOUT_STATUS_PENDING;
        rows.push({
          code,
          description: item?.desc || "",
          reelNumber,
          totalLength: lengthSum,
          spans: chargeoutSpans,
          journalLine: chargeout.journalLine || "",
          reference: chargeout.reference || "",
          submitted: !!chargeout.submitted,
          chargeoutStatus: chargeoutStatusLabel,
        });
      }
    }
    return rows;
  }, [workOrder, grouped, getReelChargeout, getItemState]);

  const aggregateTotals = useMemo(
    () =>
      reelRows.reduce(
        (acc, row) => ({
          quantity: acc.quantity + row.totalLength,
          length: acc.length + row.totalLength,
        }),
        { quantity: 0, length: 0 },
      ),
    [reelRows],
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

  const isLocked = activeStatus !== CHARGEOUT_STATUS_PENDING;

  const handleChargeoutChange = (row, field) => (event) => {
    if (!workOrder || isLocked) return;
    setReelChargeout(workOrder, row.code, row.reelNumber, {
      [field]: event.target.value,
    });
  };

  const postableSpans = useMemo(() => {
    const spans = [];
    reelRows.forEach((row) => {
      row.spans.forEach((span) => {
        if (normalizeChargeoutStatus(span.chargeoutStatus) === CHARGEOUT_STATUS_OK_TO_POST) {
          spans.push({ ...span, code: row.code, reelNumber: row.reelNumber });
        }
      });
    });
    return spans;
  }, [reelRows]);

  const applyStatusToSpans = (nextStatus) => {
    if (!workOrder || !updateAllocation) return;
    reelRows.forEach((row) => {
      row.spans.forEach((span) => {
        updateAllocation(workOrder, row.code, span.allocationId, {
          chargeoutStatus: nextStatus,
        });
      });
    });
  };

  const handleOpenPostModal = () => {
    setPostModalOpen(true);
    setJournalEntryInput("");
    setPostError("");
  };

  const handleStatusSelection = (nextStatus) => {
    if (nextStatus === CHARGEOUT_STATUS_POSTED) {
      if (postableSpans.length > 0) {
        handleOpenPostModal();
        return;
      }
      setActiveStatus(nextStatus);
      applyStatusToSpans(nextStatus);
      return;
    }
    setActiveStatus(nextStatus);
    applyStatusToSpans(nextStatus);
  };

  const handleConfirmPost = () => {
    if (!workOrder || !updateAllocation) return;
    const trimmed = journalEntryInput.trim();
    if (!trimmed) {
      setPostError("Enter a journal entry number.");
      return;
    }
    postableSpans.forEach((span) => {
      updateAllocation(workOrder, span.code, span.allocationId, {
        chargeoutStatus: CHARGEOUT_STATUS_POSTED,
        chargeoutJournalEntry: trimmed,
      });
    });
    setPostModalOpen(false);
    setJournalEntryInput("");
    setPostError("");
    setActiveStatus(CHARGEOUT_STATUS_POSTED);
  };

  const hasReels = reelRows.length > 0;
  const postableCount = postableSpans.length;

  const getNextBatchLineValue = () => {
    const values = reelRows
      .map((row) => String(row.journalLine || "").trim())
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return null;
    return Math.max(...values) + 1;
  };

  const handleBatchLineFocus = (row) => () => {
    if (!workOrder || isLocked) return;
    const currentValue = row.journalLine;
    if (currentValue !== null && currentValue !== undefined && String(currentValue).trim() !== "") {
      return;
    }
    const nextValue = getNextBatchLineValue();
    if (!Number.isFinite(nextValue)) return;
    setReelChargeout(workOrder, row.code, row.reelNumber, {
      journalLine: String(nextValue),
    });
  };

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
            <span>Charge-out Status</span>
            <span className="text-[11px] font-normal text-slate-400">Updated live</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleStatusSelection(option)}
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
            disabled={isLocked}
            className="rounded-2xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
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
                  "Qty (derived from spans)",
                  "Charge-out status",
                  "Batch Line #",
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
                    <td className="px-3 py-2 text-slate-600">{formatFootage(row.totalLength)} ft</td>
                    <td className="px-3 py-2 text-slate-600">
                      <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {row.chargeoutStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <input
                        type="text"
                        value={row.journalLine}
                        onChange={handleChargeoutChange(row, "journalLine")}
                        onFocus={handleBatchLineFocus(row)}
                        disabled={isLocked}
                        className="w-24 rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-900 focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <input
                        type="text"
                        value={row.reference}
                        onChange={handleChargeoutChange(row, "reference")}
                        disabled={isLocked}
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
            No charge-out spans flagged yet. Use the allocation table to flag eligible spans for charge-out.
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Cable Spans by Reel</h3>
          <button
            type="button"
            onClick={() => handleStatusSelection(CHARGEOUT_STATUS_POSTED)}
            disabled={!postableCount}
            className="rounded-2xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Mark OK to Post as Posted {postableCount ? `(${postableCount})` : ""}
          </button>
        </div>
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
                      {[
                        "Span ID",
                        "From",
                        "To",
                        "Length (ft)",
                        "Quantity",
                        "Journal Entry",
                        "Comments",
                      ].map((label) => (
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
                          <td className="px-3 py-2 text-slate-700">
                            {span.chargeoutJournalEntry
                              ? span.chargeoutJournalEntry
                              : activeStatus === CHARGEOUT_STATUS_POSTED
                                ? "Awaiting JE"
                                : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                placeholder="Optional comment"
                                disabled={isLocked}
                                className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-slate-900 focus:ring-0"
                              />
                            </div>
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
            Flag spans in the allocations list to populate the charge-out detail view.
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
            disabled={isLocked}
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
                    <span className="text-sm text-slate-900">Batch line {entry.line}</span>
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
          disabled={isLocked}
          className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save &amp; Send for Chargeout
        </button>
      </div>
      {postModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setPostModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Post charge-out spans</div>
            <p className="mt-1 text-xs text-slate-500">
              Apply a journal entry number to {postableCount} span{postableCount === 1 ? "" : "s"} marked Ok to Post.
            </p>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Journal Entry Number
            </label>
            <input
              type="text"
              value={journalEntryInput}
              onChange={(event) => {
                setJournalEntryInput(event.target.value);
                if (postError) setPostError("");
              }}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-900 focus:ring-0"
              placeholder="e.g., JE-104392"
            />
            {postError && <div className="mt-2 text-xs text-red-600">{postError}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPostModalOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPost}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
              >
                Post spans
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
