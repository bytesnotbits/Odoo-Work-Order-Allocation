const MIME_JSON = "application/json";

function isObject(value) {
  return value && typeof value === "object";
}

function defaultFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `wo-state-${timestamp}.json`;
}

export function buildStatePayload({ rawRows, miscEntries, workOrderNotes, allocState, selectedWO, tab }) {
  const normalizedTab =
    tab === "accounting" || tab === "engineering" || tab === "chargeout" ? tab : "engineering";
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    rawRows: Array.isArray(rawRows) ? rawRows : [],
    miscEntries: isObject(miscEntries) ? miscEntries : {},
    workOrderNotes: isObject(workOrderNotes) ? workOrderNotes : {},
    allocState: isObject(allocState) ? allocState : {},
    selectedWO: selectedWO || "",
    tab: normalizedTab,
  };
}

export function downloadStateJson(data, filename = defaultFilename()) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: MIME_JSON });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export async function readStateJson(file) {
  const text = await file.text();
  return JSON.parse(text);
}
