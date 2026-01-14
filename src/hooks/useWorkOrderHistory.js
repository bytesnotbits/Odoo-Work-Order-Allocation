import { useCallback, useEffect, useState } from "react";

import {
  loadHistoryEntries,
  persistHistoryEntries,
  defaultHistoryStatus,
  WORK_ORDER_HISTORY_STATUSES,
} from "../utils/workOrderHistory";

const MAX_HISTORY_ENTRIES = 200;

const parseTimestamp = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

export function useWorkOrderHistory() {
  const [entries, setEntries] = useState(() => loadHistoryEntries());

  useEffect(() => {
    persistHistoryEntries(entries);
  }, [entries]);

  const upsertEntry = useCallback((entry) => {
    if (!entry?.id) return;
    setEntries((prev) => {
      const now = new Date().toISOString();
      const existing = prev.find((item) => item.id === entry.id);
      const status = entry.status || existing?.status || defaultHistoryStatus();
      const snapshot = entry.snapshot ?? existing?.snapshot;
      const createdAt = existing?.createdAt || entry.createdAt || now;
      const updatedEntry = {
        ...existing,
        ...entry,
        id: entry.id,
        status,
        createdAt,
        updatedAt: now,
        snapshot,
      };
      const others = prev.filter((item) => item.id !== entry.id);
      const combined = [updatedEntry, ...others];
      combined.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt));
      return combined.slice(0, MAX_HISTORY_ENTRIES);
    });
  }, []);

  const removeEntry = useCallback((id) => {
    if (!id) return;
    setEntries((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
  }, []);

  const setEntryStatus = useCallback((id, status, actor) => {
    if (!id || !status) return;
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const now = new Date().toISOString();
        return {
          ...entry,
          status:
            WORK_ORDER_HISTORY_STATUSES.some((value) => value.value === status)
              ? status
              : entry.status,
          updatedAt: now,
          modifiedAt: now,
          modifiedBy: actor || entry.modifiedBy || "",
        };
      }),
    );
  }, []);

  return {
    entries,
    upsertEntry,
    removeEntry,
    clearHistory,
    setEntryStatus,
  };
}
