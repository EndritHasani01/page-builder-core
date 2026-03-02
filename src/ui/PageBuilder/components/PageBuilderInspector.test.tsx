import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createDefaultDocument,
  createDeterministicIdFactory,
  createNode,
  validateDocument,
} from "@/editor-core";
import { editorStore } from "@/store";

import { PageBuilderInspector } from "./PageBuilderInspector";

// ─── Test setup helpers ───────────────────────────────────────────────────────

function makeIdFactory() {
  return createDeterministicIdFactory({
    startAt: {
      page: 2,
      section: 2,
      columns: 2,
      column: 3,
      container: 1,
      text: 1,
      image: 1,
      button: 1,
      spacer: 1,
      divider: 1,
    },
  });
}

function getFirstColumnId(doc: ReturnType<typeof createDefaultDocument>): string {
  const columnsNode = Object.values(doc.nodes).find((n) => n.type === "columns")!;
  return columnsNode.children[0]!;
}

function setupStoreWithTextNode() {
  const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
  const idFactory = makeIdFactory();
  const col1Id = getFirstColumnId(doc);

  const textNode = createNode("text", {
    idFactory,
    parentId: col1Id,
    props: { content: [{ text: "Hello" }], as: "p" },
  });

  const updatedDoc = {
    ...doc,
    nodes: {
      ...doc.nodes,
      [textNode.id]: textNode,
      [col1Id]: { ...doc.nodes[col1Id]!, children: [...doc.nodes[col1Id]!.children, textNode.id] },
    },
  };

  editorStore.setState({
    doc: updatedDoc,
    issues: validateDocument(updatedDoc),
    mode: "edit",
    breakpoint: "base",
    selectedId: textNode.id,
    hoveredId: null,
    idFactory,
    undoStack: [],
    redoStack: [],
    activeTxn: null,
    clipboard: null,
  });

  return { textNodeId: textNode.id };
}

function setupStoreWithContainerNode() {
  const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
  const idFactory = makeIdFactory();
  const col1Id = getFirstColumnId(doc);

  const containerNode = createNode("container", {
    idFactory,
    parentId: col1Id,
    props: { as: "div" },
  });

  const updatedDoc = {
    ...doc,
    nodes: {
      ...doc.nodes,
      [containerNode.id]: containerNode,
      [col1Id]: { ...doc.nodes[col1Id]!, children: [...doc.nodes[col1Id]!.children, containerNode.id] },
    },
  };

  editorStore.setState({
    doc: updatedDoc,
    issues: validateDocument(updatedDoc),
    mode: "edit",
    breakpoint: "base",
    selectedId: containerNode.id,
    hoveredId: null,
    idFactory,
    undoStack: [],
    redoStack: [],
    activeTxn: null,
    clipboard: null,
  });

  return { containerNodeId: containerNode.id };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PageBuilderInspector redesign", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {});

  // ── Section visibility ────────────────────────────────────────────────────

  test("text node: Content and Typography sections are expanded, Layout section is not shown", () => {
    setupStoreWithTextNode();
    render(<PageBuilderInspector />);

    // Content section should be present and expanded
    const contentToggle = screen.getByRole("button", { name: "Content" });
    expect(contentToggle).toBeInTheDocument();
    expect(contentToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Content" })).toBeInTheDocument();

    // Typography section should be present and expanded for text nodes
    const typographyToggle = screen.getByRole("button", { name: "Typography" });
    expect(typographyToggle).toBeInTheDocument();
    expect(typographyToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Typography" })).toBeInTheDocument();

    // Layout section should NOT be rendered (text nodes have no layout)
    expect(screen.queryByRole("button", { name: "Layout" })).not.toBeInTheDocument();
  });

  test("container node: Layout section is shown, Typography section is not shown", () => {
    setupStoreWithContainerNode();
    render(<PageBuilderInspector />);

    // Layout section should exist for container
    expect(screen.getByRole("button", { name: "Layout" })).toBeInTheDocument();

    // Typography should NOT be shown for container
    expect(screen.queryByRole("button", { name: "Typography" })).not.toBeInTheDocument();
  });

  // ── Box model editor ──────────────────────────────────────────────────────

  test("setting padding-top in the box model editor dispatches UPDATE_STYLE with paddingTop", () => {
    const { textNodeId } = setupStoreWithTextNode();
    render(<PageBuilderInspector />);

    // Expand the Spacing section (starts collapsed for a node with no spacing values)
    const spacingToggle = screen.getByRole("button", { name: "Spacing" });
    if (spacingToggle.getAttribute("aria-expanded") === "false") {
      fireEvent.click(spacingToggle);
    }

    // Find the "padding top" side button inside the box model editor
    const boxModel = screen.getByLabelText("Box model editor");
    const paddingTopBtn = within(boxModel).getByRole("button", { name: "padding top" });
    fireEvent.click(paddingTopBtn);

    // Input should appear
    const input = within(boxModel).getByRole("textbox", { name: "padding top" });
    fireEvent.change(input, { target: { value: "16px" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Store should have paddingTop: '16px' for the text node
    expect(editorStore.getState().doc.nodes[textNodeId]?.style?.base?.paddingTop).toBe("16px");
    expect(editorStore.getState().undoStack.length).toBeGreaterThan(0);
  });

  // ── Quick type switching ──────────────────────────────────────────────────

  test("switching text node from p to h2 updates props.as in the store", () => {
    const { textNodeId } = setupStoreWithTextNode();
    render(<PageBuilderInspector />);

    // The TypeSwitcher should show a dropdown for the text node
    const variantSelect = screen.getByRole("combobox", { name: /Switch Text variant/ });
    expect(variantSelect).toBeInTheDocument();
    expect(variantSelect).toHaveValue("p");

    // Switch to h2
    fireEvent.change(variantSelect, { target: { value: "h2" } });

    // Store should update props.as
    const updated = editorStore.getState().doc.nodes[textNodeId];
    expect((updated?.props as { as: string }).as).toBe("h2");
    expect(editorStore.getState().undoStack.length).toBeGreaterThan(0);
  });

  test("type switcher is not shown for nodes without variants (image)", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = makeIdFactory();
    const col1Id = getFirstColumnId(doc);

    const imageNode = createNode("image", {
      idFactory,
      parentId: col1Id,
      props: { src: "https://example.com/img.jpg", alt: "test", fit: "cover" },
    });

    const updatedDoc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [imageNode.id]: imageNode,
        [col1Id]: { ...doc.nodes[col1Id]!, children: [...doc.nodes[col1Id]!.children, imageNode.id] },
      },
    };

    editorStore.setState({
      doc: updatedDoc,
      issues: validateDocument(updatedDoc),
      mode: "edit",
      breakpoint: "base",
      selectedId: imageNode.id,
      hoveredId: null,
      idFactory,
      undoStack: [],
      redoStack: [],
      activeTxn: null,
      clipboard: null,
    });

    render(<PageBuilderInspector />);

    // No variant selector for image
    expect(screen.queryByRole("combobox", { name: /Switch Image variant/ })).not.toBeInTheDocument();

    // The type label "Image" is shown in the type switcher
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  // ── Constraints section ────────────────────────────────────────────────────

  test("toggling locked in Constraints section updates node constraints", () => {
    const { textNodeId } = setupStoreWithTextNode();
    render(<PageBuilderInspector />);

    // Expand Constraints section
    const constraintsToggle = screen.getByRole("button", { name: "Constraints" });
    if (constraintsToggle.getAttribute("aria-expanded") === "false") {
      fireEvent.click(constraintsToggle);
    }

    const constraintsRegion = screen.getByRole("region", { name: "Constraints" });
    const lockedCheckbox = within(constraintsRegion).getByRole("checkbox", { name: /Locked/ });
    expect(lockedCheckbox).not.toBeChecked();

    fireEvent.click(lockedCheckbox);

    expect(editorStore.getState().doc.nodes[textNodeId]?.constraints?.locked).toBe(true);
  });

  // ── Collapsible sections ───────────────────────────────────────────────────

  test("clicking a collapsed section header expands it", () => {
    setupStoreWithTextNode();
    render(<PageBuilderInspector />);

    // Appearance starts collapsed for a fresh node with no style values
    const appearanceToggle = screen.getByRole("button", { name: "Appearance" });
    expect(appearanceToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Appearance" })).not.toBeInTheDocument();

    fireEvent.click(appearanceToggle);

    expect(appearanceToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument();
  });
});
