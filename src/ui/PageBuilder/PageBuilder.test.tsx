import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode, validateDocument } from "@/editor-core";
import { editorStore } from "@/store";

import { PageBuilder } from "./PageBuilder";

function resetSingletonStore() {
  const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
  const idFactory = createDeterministicIdFactory({
    startAt: { page: 2, section: 2, columns: 2, column: 3, container: 1, text: 1, image: 1, button: 1, spacer: 1, divider: 1 },
  });
  editorStore.setState({
    doc,
    issues: validateDocument(doc),
    mode: "edit",
    breakpoint: "lg",
    selectedId: doc.rootId,
    hoveredId: null,
    idFactory,
    undoStack: [],
    redoStack: [],
    activeTxn: null,
    clipboard: null,
  });
}

describe("PageBuilder integration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pb:activeDocId", "default");
    localStorage.setItem("pb:index:v1", '{"version":1,"docs":[{"id":"default","title":"Test","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}');
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("inline editing Text on the canvas updates the store and creates a history entry", async () => {
    render(<PageBuilder />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Select a Column so palette insertion targets a valid container.
    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));
    const undoBefore = editorStore.getState().undoStack.length;

    fireEvent.doubleClick(canvas.getByText("Text"));

    const editable = canvas.getByText("Text");
    editable.textContent = "ABC";
    fireEvent.blur(editable);

    await waitFor(() => expect(canvas.getByText("ABC")).toBeInTheDocument());
    expect(editorStore.getState().undoStack.length).toBe(undoBefore + 1);
  });

  test("undo/redo restores document state and keeps selection valid", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));

    // Edit the text node inline on the canvas.
    fireEvent.doubleClick(canvas.getByText("Text"));
    const editable = canvas.getByText("Text");
    editable.textContent = "Hello";
    fireEvent.blur(editable);

    await waitFor(() => expect(canvas.getByText("Hello")).toBeInTheDocument());

    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas.getByText("Text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas.queryByText("Text")).not.toBeInTheDocument();
    expect(inspector.getByText("Page Settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(canvas.getByText("Hello")).toBeInTheDocument();
    expect(inspector.getByText("Page Settings")).toBeInTheDocument();
  });

  test("shows a storage quota banner when saving fails with QuotaExceededError", async () => {
    render(<PageBuilder />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("pb:doc:default")) {
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      }
      return original.call(this, key, value);
    });

    fireEvent.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Storage status" })).toBeInTheDocument(),
    );
    expect(screen.getByText(/LocalStorage is full/i)).toBeInTheDocument();
  });

  test("import replace applies the new document", async () => {
    const imported = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    imported.meta.title = "Imported";
    const idFactory = createDeterministicIdFactory({ startAt: { text: 10 } });
    const importedText = createNode("text", { idFactory, parentId: "column_1", props: { content: [{ text: "Imported text" }], as: "p" } });
    imported.nodes[importedText.id] = importedText;
    imported.nodes.column_1.children = [importedText.id];

    render(<PageBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));

    const textarea = screen.getByPlaceholderText(/Paste a document JSON/i);
    fireEvent.change(textarea, { target: { value: JSON.stringify(imported, null, 2) } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import JSON" })).not.toBeInTheDocument());
    expect(screen.getByText("Imported text")).toBeInTheDocument();
    expect(editorStore.getState().doc.meta.title).toBe("Imported");
  });

  test("import merge inserts sections with remapped ids", async () => {
    const imported = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory({ startAt: { text: 10 } });
    const mergedText = createNode("text", { idFactory, parentId: "column_1", props: { content: [{ text: "Merged text" }], as: "p" } });
    imported.nodes[mergedText.id] = mergedText;
    imported.nodes.column_1.children = [mergedText.id];

    render(<PageBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));

    const textarea = screen.getByPlaceholderText(/Paste a document JSON/i);
    fireEvent.change(textarea, { target: { value: JSON.stringify(imported, null, 2) } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Merge sections" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Merge sections" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import JSON" })).not.toBeInTheDocument());
    expect(screen.getByText("Merged text")).toBeInTheDocument();

    const root = editorStore.getState().doc.nodes[editorStore.getState().doc.rootId];
    expect(root.type).toBe("page");
    expect(root.children.length).toBe(2);
    expect(editorStore.getState().doc.nodes.section_2?.type).toBe("section");
  });

  test("importing unsafe URLs blocks navigation and produces HTML export warnings", async () => {
    const imported = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory({ startAt: { button: 10 } });
    const unsafeButton = createNode("button", {
      idFactory,
      parentId: "column_1",
      props: { label: "Unsafe nav", href: "javascript:alert(1)", variant: "primary" },
    });
    imported.nodes[unsafeButton.id] = unsafeButton;
    imported.nodes.column_1.children = [unsafeButton.id];

    render(<PageBuilder />);
    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));

    const textarea = screen.getByPlaceholderText(/Paste a document JSON/i);
    fireEvent.change(textarea, { target: { value: JSON.stringify(imported, null, 2) } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import JSON" })).not.toBeInTheDocument());

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));
    expect(canvas.getByRole("button", { name: "Unsafe nav" })).toBeInTheDocument();
    expect(canvas.queryByRole("link", { name: "Unsafe nav" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText(/Unsafe URLs are removed from HTML export/i)).toBeInTheDocument();
  });

  test("inline editing Text commits on blur", async () => {
    render(<PageBuilder />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Select a Column so palette insertion targets a valid container.
    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));
    fireEvent.doubleClick(canvas.getByText("Text"));

    const editable = canvas.getByText("Text");
    expect(editable).toHaveAttribute("contenteditable", "true");

    editable.textContent = "Inline edit";
    fireEvent.blur(editable);

    await waitFor(() => {
      const textNodes = Object.values(editorStore.getState().doc.nodes).filter((n) => n.type === "text");
      expect(textNodes).toHaveLength(1);
      const node = textNodes[0];
      if (!node) throw new Error("Expected a Text node to exist.");
      if (node.type !== "text") throw new Error("Expected node to be of type text.");
      expect(node.props.content[0]?.text).toBe("Inline edit");
    });

    expect(canvas.getByText("Inline edit")).toBeInTheDocument();
  });

  test("inline editing Text cancels on Escape", async () => {
    render(<PageBuilder />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Select a Column so palette insertion targets a valid container.
    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));
    fireEvent.doubleClick(canvas.getByText("Text"));

    const editable = canvas.getByText("Text");
    expect(editable).toHaveAttribute("contenteditable", "true");

    editable.textContent = "Should not commit";
    fireEvent.keyDown(editable, { key: "Escape" });

    await waitFor(() => {
      const textNodes = Object.values(editorStore.getState().doc.nodes).filter((n) => n.type === "text");
      expect(textNodes).toHaveLength(1);
      const node = textNodes[0];
      if (!node) throw new Error("Expected a Text node to exist.");
      if (node.type !== "text") throw new Error("Expected node to be of type text.");
      expect(node.props.content[0]?.text).toBe("Text");
    });

    expect(canvas.getByText("Text")).toBeInTheDocument();
    expect(canvas.queryByText("Should not commit")).not.toBeInTheDocument();
  });

  test("editing Columns count uses a numeric patch and keeps children in sync", async () => {
    const originalDispatch = editorStore.getState().dispatch;
    const dispatchSpy = vi.fn((action, opts) => originalDispatch(action, opts));
    editorStore.setState({ dispatch: dispatchSpy });

    try {
      render(<PageBuilder />);
      await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

      const canvas = within(screen.getByRole("region", { name: "Canvas" }));
      fireEvent.click(canvas.getByLabelText("Drag Columns"));

      const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
      const input = inspector.getByLabelText(/^Columns/);

      expect(input).toHaveAttribute("type", "number");
      expect(input).toHaveAttribute("min", "2");
      expect(input).toHaveAttribute("max", "6");
      expect(input).toHaveAttribute("step", "1");

      fireEvent.change(input, { target: { value: "3" } });

      const updatePropsCalls = dispatchSpy.mock.calls
        .map(([action]) => action)
        .filter(
          (action) =>
            typeof action === "object" &&
            action !== null &&
            "type" in action &&
            action.type === "UPDATE_PROPS" &&
            "nodeId" in action &&
            action.nodeId === "columns_1" &&
            "patch" in action &&
            typeof action.patch === "object" &&
            action.patch !== null &&
            Object.prototype.hasOwnProperty.call(action.patch, "columns"),
        );

      expect(updatePropsCalls.length).toBeGreaterThan(0);
      const last = updatePropsCalls[updatePropsCalls.length - 1] as { patch: Record<string, unknown> };
      expect(typeof last.patch.columns).toBe("number");
      expect(last.patch.columns).toBe(3);

      const doc = editorStore.getState().doc;
      const columnsNode = doc.nodes.columns_1;
      expect(columnsNode.type).toBe("columns");
      if (columnsNode.type !== "columns") throw new Error('Expected "columns_1" node to be of type "columns".');

      expect(columnsNode.props.columns).toBe(3);
      expect(columnsNode.children).toHaveLength(3);
      expect(doc.nodes.column_3?.type).toBe("column");

      await waitFor(() => expect(screen.getAllByLabelText("Drag Column")).toHaveLength(3));
    } finally {
      act(() => {
        editorStore.setState({ dispatch: originalDispatch });
      });
    }
  });
});
