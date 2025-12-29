import { buildStatePayload } from "../utils/stateIO";

test("buildStatePayload includes all session fields", () => {
  const payload = buildStatePayload({
    rawRows: [{ foo: "bar" }],
    miscEntries: { WO1: [{ code: "MISC-1" }] },
    workOrderNotes: { WO1: "Note" },
    allocState: { "WO1|111": { allocations: [] } },
    selectedWO: "WO1",
    tab: "accounting",
  });
  expect(payload).toMatchObject({
    schemaVersion: 1,
    rawRows: [{ foo: "bar" }],
    miscEntries: { WO1: [{ code: "MISC-1" }] },
    workOrderNotes: { WO1: "Note" },
    allocState: { "WO1|111": { allocations: [] } },
    selectedWO: "WO1",
    tab: "accounting",
  });
  expect(typeof payload.exportedAt).toBe("string");
});

test("buildStatePayload sanitizes inputs with defaults", () => {
  const payload = buildStatePayload({
    rawRows: "not array",
    miscEntries: null,
    workOrderNotes: undefined,
    allocState: null,
    selectedWO: "",
    tab: "unknown",
  });
  expect(payload.rawRows).toEqual([]);
  expect(payload.miscEntries).toEqual({});
  expect(payload.workOrderNotes).toEqual({});
  expect(payload.allocState).toEqual({});
  expect(payload.tab).toBe("engineering");
});
