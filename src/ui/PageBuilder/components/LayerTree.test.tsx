import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode, validateDocument } from "@/editor-core";
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

function switchToLayersTab() {
  fireEvent.click(screen.getByRole("button", { name: "Layers" }));
}

describe("LayerTree", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders the full document hierarchy in the Layers tab", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    const tree = screen.getByRole("tree", { name: "Document layers" });
    expect(tree).toBeInTheDocument();

    // Query within the tree to avoid ambiguity with toolbar dropdowns
    const treeScope = within(tree);
    expect(treeScope.getByText("Section")).toBeInTheDocument();
    expect(treeScope.getByText("Columns (2)")).toBeInTheDocument();
    expect(treeScope.getByText("Column 1")).toBeInTheDocument();
    expect(treeScope.getByText("Column 2")).toBeInTheDocument();
  });

  test("tree rows are indented according to their depth", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    const tree = screen.getByRole("tree");
    const treeItems = tree.querySelectorAll("[data-tree-row]");

    // Collect paddingLeft values for depth ordering
    const paddings = Array.from(treeItems).map((el) =>
      parseInt((el as HTMLElement).style.paddingLeft, 10),
    );

    // page < section < columns < column
    expect(paddings[0]).toBeLessThan(paddings[1]!);
    expect(paddings[1]).toBeLessThan(paddings[2]!);
    expect(paddings[2]).toBeLessThan(paddings[3]!);
  });

  test("clicking a tree row updates the store selectedId", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    fireEvent.click(screen.getByText("Section"));
    expect(editorStore.getState().selectedId).toBe("section_1");
  });

  test("selected tree row reflects the canvas selection", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    fireEvent.click(screen.getByText("Columns (2)"));
    expect(editorStore.getState().selectedId).toBe("columns_1");

    const columnsRow = screen.getByText("Columns (2)").closest("[data-tree-row]");
    expect(columnsRow).toHaveAttribute("data-selected");
  });

  test("collapse/expand toggles child visibility", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    expect(screen.getByText("Section")).toBeInTheDocument();
    expect(screen.getByText("Columns (2)")).toBeInTheDocument();

    const sectionRow = screen.getByText("Section").closest("[data-tree-row]") as HTMLElement;
    const chevron = sectionRow.querySelector("button[aria-label='Collapse']") as HTMLElement;
    fireEvent.click(chevron);

    expect(screen.queryByText("Columns (2)")).not.toBeInTheDocument();

    const expandChevron = sectionRow.querySelector("button[aria-label='Expand']") as HTMLElement;
    fireEvent.click(expandChevron);

    expect(screen.getByText("Columns (2)")).toBeInTheDocument();
  });

  test("displays text node label from its content", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Insert a Text block via the palette into the first column
    fireEvent.click(screen.getAllByLabelText("Drag Column")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^Text$/ }));

    // Switch to Layers tab and verify the text label is visible
    switchToLayersTab();

    // The default text node content is "Text"
    const tree = screen.getByRole("tree", { name: "Document layers" });
    expect(within(tree).getByText("Text")).toBeInTheDocument();
  });

  test("tree row carries stable data-node-id for context menu compatibility", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    switchToLayersTab();

    const sectionRow = document.querySelector('[data-tree-row="section_1"]');
    expect(sectionRow).not.toBeNull();
    expect(sectionRow).toHaveAttribute("data-node-id", "section_1");
  });
});
