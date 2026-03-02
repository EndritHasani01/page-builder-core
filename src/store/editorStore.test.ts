import { describe, expect, test, vi } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory } from "@/editor-core";
import { createEditorStore } from "@/store";

describe("editor store", () => {
  test("dispatch + undo/redo works for ADD_NODE", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const store = createEditorStore({ doc });

    store.getState().dispatch({
      type: "ADD_NODE",
      parentId: "column_1",
      nodeType: "text",
      id: "text_1",
      initialProps: { content: [{ text: "Hello" }], as: "p" },
    });

    expect(store.getState().doc.nodes.text_1?.type).toBe("text");
    expect(store.getState().doc.nodes.column_1?.children).toContain("text_1");
    expect(store.getState().undoStack.length).toBe(1);

    store.getState().undo();
    expect(store.getState().doc.nodes.text_1).toBeUndefined();
    expect(store.getState().doc.nodes.column_1?.children).not.toContain("text_1");
    expect(store.getState().redoStack.length).toBe(1);

    store.getState().redo();
    expect(store.getState().doc.nodes.text_1?.type).toBe("text");
    expect(store.getState().doc.nodes.column_1?.children).toContain("text_1");
  });

  test("coalesces history entries by coalesceKey within time window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-18T12:00:00.000Z"));

    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const store = createEditorStore({ doc });

    store.getState().dispatch({
      type: "ADD_NODE",
      parentId: "column_1",
      nodeType: "text",
      id: "text_1",
      initialProps: { content: [{ text: "A" }], as: "p" },
    });

    store.getState().dispatch(
      { type: "UPDATE_PROPS", nodeId: "text_1", patch: { content: [{ text: "AB" }] } },
      { coalesceKey: "text_1:props.text", historyLabel: "Type" },
    );
    expect(store.getState().undoStack.length).toBe(2);

    vi.setSystemTime(new Date("2026-02-18T12:00:00.200Z"));
    store.getState().dispatch(
      { type: "UPDATE_PROPS", nodeId: "text_1", patch: { content: [{ text: "ABC" }] } },
      { coalesceKey: "text_1:props.text", historyLabel: "Type" },
    );

    // Still 2 entries (ADD_NODE + merged typing edits)
    expect(store.getState().undoStack.length).toBe(2);
    const nodeAfter = store.getState().doc.nodes.text_1;
    expect(nodeAfter?.type).toBe("text");
    if (nodeAfter?.type === "text") {
      expect(nodeAfter.props.content[0]?.text).toBe("ABC");
    }

    vi.setSystemTime(new Date("2026-02-18T12:00:01.000Z"));
    store.getState().dispatch(
      { type: "UPDATE_PROPS", nodeId: "text_1", patch: { content: [{ text: "ABCD" }] } },
      { coalesceKey: "text_1:props.text", historyLabel: "Type" },
    );
    expect(store.getState().undoStack.length).toBe(3);

    vi.useRealTimers();
  });

  test("groups changes into one history entry via transactions", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const store = createEditorStore({ doc });

    store.getState().dispatch({
      type: "ADD_NODE",
      parentId: "column_1",
      nodeType: "text",
      id: "text_1",
      initialProps: { content: [{ text: "Hello" }], as: "p" },
    });
    const undoBefore = store.getState().undoStack.length;

    store.getState().beginTransaction("Composite edit");
    store.getState().dispatch({ type: "UPDATE_PROPS", nodeId: "text_1", patch: { content: [{ text: "Hello!" }] } });
    store.getState().dispatch({
      type: "UPDATE_STYLE",
      nodeId: "text_1",
      breakpoint: "base",
      patch: { fontWeight: 700 },
    });
    store.getState().commitTransaction();

    expect(store.getState().undoStack.length).toBe(undoBefore + 1);
    const nodeAfterTxn = store.getState().doc.nodes.text_1;
    expect(nodeAfterTxn?.type).toBe("text");
    if (nodeAfterTxn?.type === "text") {
      expect(nodeAfterTxn.props.content[0]?.text).toBe("Hello!");
    }

    store.getState().undo();
    const nodeAfterUndo = store.getState().doc.nodes.text_1;
    expect(nodeAfterUndo?.type).toBe("text");
    if (nodeAfterUndo?.type === "text") {
      expect(nodeAfterUndo.props.content[0]?.text).toBe("Hello");
      expect(nodeAfterUndo.style?.base.fontWeight).toBeUndefined();
    }
  });

  test("copy/cut/paste is structural and remaps ids", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory({ startAt: { text: 10 } });
    const store = createEditorStore({ doc, idFactory });

    store.getState().dispatch({
      type: "ADD_NODE",
      parentId: "column_1",
      nodeType: "text",
      id: "text_1",
      initialProps: { content: [{ text: "Copy me" }], as: "p" },
    });
    store.getState().dispatch({ type: "SET_SELECTED", nodeId: "text_1" });

    const copyRes = store.getState().copySelected();
    expect(copyRes.ok).toBe(true);
    expect(store.getState().clipboard?.rootId).toBe("text_1");

    const cutRes = store.getState().cutSelected();
    expect(cutRes.ok).toBe(true);
    expect(store.getState().doc.nodes.text_1).toBeUndefined();

    const pasteRes = store.getState().paste();
    expect(pasteRes.ok).toBe(true);
    expect(store.getState().doc.nodes[pasteRes.ok ? pasteRes.insertedRootId : ""]?.type).toBe("text");
    expect(store.getState().doc.nodes.column_1?.children).toContain(pasteRes.ok ? pasteRes.insertedRootId : "");
  });
});
