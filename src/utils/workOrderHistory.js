const STORAGE_KEY = "wo-allocation-history";
const MAX_ENTRIES = 200;

const DEFAULT_STATUS = "open";

export const WORK_ORDER_HISTORY_STATUSES = [
  { value: "open", label: "Open" },
  { value: "submitted", label: "Submitted for Close" },
  { value: "closed", label: "Closed" },
];

const isValidStatus = (value) =>
  WORK_ORDER_HISTORY_STATUSES.some((status) => status.value === value);

const normalizeStatus = (value) => {
  if (value === "to_close") return "submitted";
  return value;
};

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window?.localStorage);
}

function loadHistoryFromStorage() {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveHistoryToStorage(entries) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

export function sanitizeHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === "object" && entry.id)
    .map((entry) => ({
      ...entry,
      status: (() => {
        const normalized = normalizeStatus(entry.status);
        return isValidStatus(normalized) ? normalized : DEFAULT_STATUS;
      })(),
      createdAt: entry.createdAt || "",
      updatedAt: entry.updatedAt || "",
      modifiedBy: entry.modifiedBy || "",
      modifiedAt: entry.modifiedAt || entry.updatedAt || "",
    }));
}

export function loadHistoryEntries() {
  return sanitizeHistoryEntries(loadHistoryFromStorage());
}

export function persistHistoryEntries(entries) {
  saveHistoryToStorage(entries);
}

export function defaultHistoryStatus() {
  return DEFAULT_STATUS;
}
