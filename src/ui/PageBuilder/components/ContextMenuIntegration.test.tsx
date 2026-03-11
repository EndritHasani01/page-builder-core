import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, validateDocument } from "@/editor-core";
import { editorStore } from "@/store";

import { PageBuilder } from "../PageBuilder";

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

describe("Block context menu integration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pb:activeDocId", "default");
    localStorage.setItem("pb:index:v1", '{"version":1,"docs":[{"id":"default","title":"Test","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}');
    resetSingletonStore();
  });

  afterEach(() => {});

  test("right-clicking a section block shows the context menu with expected items", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Find the section element (rendered by RenderDocument with data-node-type)
    const section = document.querySelector("[data-node-type='section']") as HTMLElement;
    expect(section).not.toBeNull();

    fireEvent.contextMenu(section);

    // Context menu should appear
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Common block menu items
    expect(screen.getByRole("menuitem", { name: /cut/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /move up/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /move down/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /select parent/i })).toBeInTheDocument();
  });

  test("right-clicking a locked block disables Cut, Delete, Move up, Move down", async () => {
    render(<PageBuilder />);
    // Wait for persistence to finish loading — it calls replaceDocument() on mount,
    // which would overwrite any constraints set before rendering.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Lock the section AFTER persistence has initialized.
    const state = editorStore.getState();
    const sectionId = state.doc.nodes[state.doc.rootId]!.children[0]!;
    state.dispatch({ type: "UPDATE_CONSTRAINTS", nodeId: sectionId, patch: { locked: true } });

    const section = document.querySelector("[data-node-type='section']") as HTMLElement;
    fireEvent.contextMenu(section);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    // Find items by text content — shortcuts are in a separate span so query by label span
    const menuEl = screen.getByRole("menu");
    const allItems = Array.from(menuEl.querySelectorAll("[role='menuitem']"));
    const findItem = (label: string) =>
      allItems.find((el) => el.textContent?.toLowerCase().includes(label.toLowerCase())) as HTMLElement | undefined;

    expect(findItem("Cut")).toBeDisabled();
    expect(findItem("Delete")).toBeDisabled();
    expect(findItem("Move up")).toBeDisabled();
    expect(findItem("Move down")).toBeDisabled();
    expect(findItem("Duplicate")).toBeDisabled();
  });

  test("clicking Duplicate from context menu duplicates the node", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    const countBefore = document.querySelectorAll("[data-node-type='section']").length;

    const section = document.querySelector("[data-node-type='section']") as HTMLElement;
    fireEvent.contextMenu(section);

    const duplicateBtn = screen.getByRole("menuitem", { name: /duplicate/i });
    fireEvent.click(duplicateBtn);

    // Menu should close
    expect(screen.queryByRole("menu")).toBeNull();

    // A new section should exist
    const countAfter = document.querySelectorAll("[data-node-type='section']").length;
    expect(countAfter).toBe(countBefore + 1);
  });

  test("context menu closes on Escape", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    const section = document.querySelector("[data-node-type='section']") as HTMLElement;
    fireEvent.contextMenu(section);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Fire keydown on the menu itself to avoid passing `window` as event target,
    // which would trip up the global shortcut handler's `el.getAttribute` check.
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("context menu is not shown in preview mode", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Switch to preview via the Mode select
    const modeSelect = screen.getByRole("combobox", { name: /mode/i });
    fireEvent.change(modeSelect, { target: { value: "preview" } });

    // In preview mode the canvas does not attach onContextMenu, so right-clicking
    // should not produce a menu.
    // The section may or may not carry data-node-type in preview; query canvas body instead.
    const canvasBody = document.querySelector("[class*='canvasBody']") as HTMLElement;
    if (canvasBody) {
      fireEvent.contextMenu(canvasBody);
      expect(screen.queryByRole("menu")).toBeNull();
    }
  });
});
