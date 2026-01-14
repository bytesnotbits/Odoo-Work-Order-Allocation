const STORAGE_KEY = "wo-user-identity";

const DEFAULT_IDENTITY = {
  name: "",
  email: "",
};

const storageAvailable = () =>
  typeof window !== "undefined" && Boolean(window?.localStorage);

const sanitizeIdentity = (value) => {
  if (!value || typeof value !== "object") return DEFAULT_IDENTITY;
  const name = String(value.name || "").trim();
  const email = String(value.email || "").trim();
  return { name, email };
};

export function loadUserIdentity() {
  if (!storageAvailable()) return DEFAULT_IDENTITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_IDENTITY;
    const parsed = JSON.parse(raw);
    return sanitizeIdentity(parsed);
  } catch {
    return DEFAULT_IDENTITY;
  }
}

export function persistUserIdentity(identity) {
  if (!storageAvailable()) return;
  try {
    const normalized = sanitizeIdentity(identity);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore quota errors
  }
}

export function defaultUserIdentity() {
  return DEFAULT_IDENTITY;
}
