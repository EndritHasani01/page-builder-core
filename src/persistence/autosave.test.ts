import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

import { createEditorStore } from "@/store";

import { startAutosave } from "./autosave";

describe("persistence/autosave", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("debounces writes and flush() saves immediately", () => {
    const store = createEditorStore();
    const docId = "t";

    const ctrl = startAutosave(store, docId, { debounceMs: 500 });
    const rootId = store.getState().doc.rootId;

    store.getState().dispatch({ type: "UPDATE_PROPS", nodeId: rootId, patch: { title: "A" } });

    expect(window.localStorage.getItem(`pb:doc:${docId}`)).toBeNull();

    ctrl.flush();
    expect(window.localStorage.getItem(`pb:doc:${docId}`)).not.toBeNull();

    ctrl.stop();
  });

  test("blocks autosave on QuotaExceededError", () => {
    const store = createEditorStore();
    const docId = "t";

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("Quota exceeded");
      (err as unknown as { name: string }).name = "QuotaExceededError";
      throw err;
    });

    let lastStatus: unknown = null;
    const ctrl = startAutosave(store, docId, { debounceMs: 10, onStatus: (s) => (lastStatus = s) });
    ctrl.flush();

    expect(ctrl.isQuotaBlocked()).toBe(true);
    expect(lastStatus).toEqual({ state: "error", error: "Storage quota exceeded.", quota: true });

    ctrl.stop();
    spy.mockRestore();
  });
});
