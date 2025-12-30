const DB_NAME = "wo-allocation-state";
const STORE_NAME = "state-snapshot";
const SNAPSHOT_KEY = "latest";
const FALLBACK_KEY = "wo-allocation-state-fallback";

function hasIndexedDB() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openIndexedDB() {
  if (!hasIndexedDB()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveToIndexedDB(payload) {
  const db = await openIndexedDB();
  if (!db) return null;
  const savedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve({ savedAt, source: "indexedDB" });
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);
    store.put({ payload, savedAt }, SNAPSHOT_KEY);
  });
}

async function loadFromIndexedDB() {
  const db = await openIndexedDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value ? { payload: value.payload, savedAt: value.savedAt, source: "indexedDB" } : null);
    };
  });
}

function saveToLocalStorage(payload) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({ payload, savedAt }));
    return { savedAt, source: "localStorage" };
  } catch {
    return null;
  }
}

function loadFromLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(FALLBACK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.payload) return null;
    return { payload: parsed.payload, savedAt: parsed.savedAt, source: "localStorage" };
  } catch {
    return null;
  }
}

export async function savePersistedState(payload) {
  if (!payload) return null;
  if (hasIndexedDB()) {
    try {
      return await saveToIndexedDB(payload);
    } catch (err) {
      console.error("IndexedDB save failed", err);
    }
  }
  return saveToLocalStorage(payload);
}

export async function loadPersistedState() {
  if (hasIndexedDB()) {
    try {
      const snapshot = await loadFromIndexedDB();
      if (snapshot) return snapshot;
    } catch (err) {
      console.error("Failed to load snapshot from IndexedDB", err);
    }
  }
  return loadFromLocalStorage();
}
