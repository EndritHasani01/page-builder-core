import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("editing Text in the inspector updates the canvas and coalesces history", async () => {
    render(<PageBuilder />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Select a Column so palette insertion targets a valid container.
    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);

    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    const input = inspector.getByLabelText(/^Text/);

    const undoBefore = editorStore.getState().undoStack.length;
    const now = vi.spyOn(Date, "now").mockReturnValue(123);

    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.change(input, { target: { value: "AB" } });
    fireEvent.change(input, { target: { value: "ABC" } });

    now.mockRestore();

    expect(screen.getByText("ABC")).toBeInTheDocument();
    expect(editorStore.getState().undoStack.length).toBe(undoBefore + 1);
  });

  test("undo/redo restores document state and keeps selection valid", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    const input = inspector.getByLabelText(/^Text/);
    fireEvent.change(input, { target: { value: "Hello" } });

    const canvas = within(screen.getByRole("region", { name: "Canvas" }));
    expect(canvas.getByText("Hello")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas.getByText("Text")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(canvas.queryByText("Text")).not.toBeInTheDocument();
    expect(inspector.getByText("Page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(canvas.getByText("Hello")).toBeInTheDocument();
    expect(inspector.getByText("Page")).toBeInTheDocument();
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
    const importedText = createNode("text", { idFactory, parentId: "column_1", props: { text: "Imported text", as: "p" } });
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
    const mergedText = createNode("text", { idFactory, parentId: "column_1", props: { text: "Merged text", as: "p" } });
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
});
