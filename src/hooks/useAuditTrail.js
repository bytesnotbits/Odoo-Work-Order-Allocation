import { useCallback, useEffect, useState } from "react";

import {
  loadAuditTrailEntries,
  persistAuditTrailEntries,
  sanitizeAuditTrailEntry,
} from "../utils/auditTrail";

const MAX_AUDIT_ENTRIES = 500;

export function useAuditTrail() {
  const [entries, setEntries] = useState(() => loadAuditTrailEntries());

  useEffect(() => {
    persistAuditTrailEntries(entries);
  }, [entries]);

  const recordAuditEvent = useCallback((event) => {
    const normalized = sanitizeAuditTrailEntry(event);
    if (!normalized) return;
    setEntries((prev) => {
      const filtered = prev.filter((item) => item.id !== normalized.id);
      return [normalized, ...filtered].slice(0, MAX_AUDIT_ENTRIES);
    });
  }, []);

  const clearAuditTrail = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, recordAuditEvent, clearAuditTrail };
}
