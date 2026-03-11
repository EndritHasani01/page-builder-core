import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

describe("DesignTokensPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pb:activeDocId", "default");
    localStorage.setItem("pb:index:v1", '{"version":1,"docs":[{"id":"default","title":"Test","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}');
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("opens when the Theme toolbar button is clicked", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    expect(screen.queryByRole("region", { name: "Design Tokens" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));

    expect(screen.getByRole("region", { name: "Design Tokens" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Design Tokens panel" })).toBeInTheDocument();
  });

  test("closes when the close button is clicked and restores Inspector", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));
    expect(screen.getByRole("region", { name: "Design Tokens" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Design Tokens panel" }));

    expect(screen.queryByRole("region", { name: "Design Tokens" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
  });

  test("changing a color token via text input updates the store", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));

    const panel = screen.getByRole("region", { name: "Design Tokens" });
    const primaryInput = within(panel).getByRole("textbox", { name: "Primary color value" });

    fireEvent.change(primaryInput, { target: { value: "#ff0000" } });

    expect(editorStore.getState().doc.theme.colors.primary).toBe("#ff0000");
    expect(editorStore.getState().undoStack.length).toBeGreaterThan(0);
  });

  test("changing a color does not affect other color tokens", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    const originalText = editorStore.getState().doc.theme.colors.text;
    const originalBorder = editorStore.getState().doc.theme.colors.border;

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));

    const panel = screen.getByRole("region", { name: "Design Tokens" });
    const primaryInput = within(panel).getByRole("textbox", { name: "Primary color value" });
    fireEvent.change(primaryInput, { target: { value: "#abcdef" } });

    expect(editorStore.getState().doc.theme.colors.primary).toBe("#abcdef");
    expect(editorStore.getState().doc.theme.colors.text).toBe(originalText);
    expect(editorStore.getState().doc.theme.colors.border).toBe(originalBorder);
  });

  test("changing spacing unit updates the store", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));

    const panel = screen.getByRole("region", { name: "Design Tokens" });
    const unitInput = within(panel).getByRole("spinbutton", { name: "Spacing unit in pixels" });
    fireEvent.change(unitInput, { target: { value: "8" } });

    expect(editorStore.getState().doc.theme.spacing.unit).toBe("8px");
  });

  test("theme changes are undoable", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    const originalPrimary = editorStore.getState().doc.theme.colors.primary;

    fireEvent.click(screen.getByRole("button", { name: "Toggle Design Tokens panel" }));

    const panel = screen.getByRole("region", { name: "Design Tokens" });
    const primaryInput = within(panel).getByRole("textbox", { name: "Primary color value" });
    fireEvent.change(primaryInput, { target: { value: "#ff0000" } });

    expect(editorStore.getState().doc.theme.colors.primary).toBe("#ff0000");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(editorStore.getState().doc.theme.colors.primary).toBe(originalPrimary);
  });
});
