import { uid } from "../lib/uid";

const STORAGE_KEY = "wo-audit-trail";
const MAX_ENTRIES = 500;

const storageAvailable = () =>
  typeof window !== "undefined" && Boolean(window?.localStorage);

const sanitizeEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const workOrderId = String(entry.workOrderId || "").trim();
  const action = String(entry.action || "").trim();
  if (!workOrderId || !action) return null;
  const details = String(entry.details || "").trim();
  const modifiedBy = String(entry.modifiedBy || "").trim();
  const modifiedAt = entry.modifiedAt || new Date().toISOString();
  const id = entry.id || uid();
  return { id, workOrderId, action, details, modifiedBy, modifiedAt };
};

const sanitizeEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => sanitizeEntry(entry))
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);
};

export function loadAuditTrailEntries() {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeEntries(parsed);
  } catch {
    return [];
  }
}

export function persistAuditTrailEntries(entries) {
  if (!storageAvailable()) return;
  try {
    const normalized = sanitizeEntries(entries);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore quota errors
  }
}

export function sanitizeAuditTrailEntry(entry) {
  return sanitizeEntry(entry);
}
