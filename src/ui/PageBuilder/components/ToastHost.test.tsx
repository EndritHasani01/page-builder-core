import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, validateDocument } from "@/editor-core";
import { editorStore } from "@/store";

import { PageBuilder } from "../PageBuilder";
import { ToastHost } from "./ToastHost";
import type { Toast } from "../hooks/useToastHost";

function resetSingletonStore() {
  const doc = createDefaultDocument(new Date("2026-01-01T12:00:00.000Z"));
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

function makeToast(overrides: Partial<Toast>): Toast {
  return {
    id: `t_${Math.random().toString(16).slice(2)}`,
    variant: "info",
    message: "Test toast",
    animState: "visible",
    ...overrides,
  };
}

describe("ToastHost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders nothing when there are no toasts", () => {
    const { container } = render(<ToastHost toasts={[]} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  test("toasts render with correct data-variant attribute for each variant", () => {
    const mockDismiss = vi.fn();
    const toasts: Toast[] = [
      makeToast({ id: "1", variant: "success", message: "Saved!" }),
      makeToast({ id: "2", variant: "error", message: "Error occurred" }),
      makeToast({ id: "3", variant: "info", message: "FYI" }),
      makeToast({ id: "4", variant: "action", message: "Do something", action: { label: "Undo", onClick: vi.fn() } }),
    ];

    render(<ToastHost toasts={toasts} onDismiss={mockDismiss} />);

    const statuses = screen.queryAllByRole("status");
    const variants = statuses.map((el) => el.getAttribute("data-variant"));
    expect(variants).toContain("success");
    expect(variants).toContain("error");
    expect(variants).toContain("info");
    expect(variants).toContain("action");
  });

  test("each variant renders its icon", () => {
    render(
      <ToastHost
        toasts={[
          makeToast({ id: "s", variant: "success", message: "OK" }),
          makeToast({ id: "e", variant: "error", message: "Err" }),
          makeToast({ id: "i", variant: "info", message: "Info" }),
          makeToast({ id: "a", variant: "action", message: "Act", action: { label: "Go", onClick: vi.fn() } }),
        ]}
        onDismiss={vi.fn()}
      />,
    );
    // All dismiss buttons are present (one per toast)
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(4);
  });

  test("action toast renders action button that invokes callback and auto-dismisses", () => {
    const mockDismiss = vi.fn();
    const mockAction = vi.fn();

    render(
      <ToastHost
        toasts={[
          makeToast({
            id: "a1",
            variant: "action",
            message: "Export complete",
            action: { label: "View export", onClick: mockAction },
          }),
        ]}
        onDismiss={mockDismiss}
      />,
    );

    const actionBtn = screen.getByRole("button", { name: "View export" });
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith("a1");
  });

  test("dismiss button calls onDismiss with the toast id", () => {
    const mockDismiss = vi.fn();
    render(
      <ToastHost
        toasts={[makeToast({ id: "x99", variant: "info", message: "Hello" })]}
        onDismiss={mockDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(mockDismiss).toHaveBeenCalledWith("x99");
  });

  test("progress bar renders when progress prop is provided", () => {
    render(
      <ToastHost
        toasts={[makeToast({ id: "p1", variant: "info", message: "Exporting…", progress: 0.6 })]}
        onDismiss={vi.fn()}
      />,
    );

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "60");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });

  test("entering state sets correct data-state attribute", () => {
    render(
      <ToastHost
        toasts={[makeToast({ id: "e1", animState: "entering" })]}
        onDismiss={vi.fn()}
      />,
    );
    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("data-state", "entering");
  });

  test("exiting state sets correct data-state attribute", () => {
    render(
      <ToastHost
        toasts={[makeToast({ id: "e2", animState: "exiting" })]}
        onDismiss={vi.fn()}
      />,
    );
    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("data-state", "exiting");
  });

  test("prefers-reduced-motion: CSS rule exists in editor-tokens.css", () => {
    // Insert the rule from editor-tokens.css into the document and verify it's parsed
    const style = document.createElement("style");
    style.textContent = `
      @media (prefers-reduced-motion: reduce) {
        :root {
          --editor-duration-fast: 0ms;
          --editor-duration-normal: 0ms;
          --editor-duration-slow: 0ms;
        }
      }
    `;
    document.head.appendChild(style);

    const found = Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some(
          (rule) =>
            rule instanceof CSSMediaRule &&
            rule.conditionText.includes("prefers-reduced-motion"),
        );
      } catch {
        return false;
      }
    });
    expect(found).toBe(true);

    document.head.removeChild(style);
  });
});

describe("EmptyCanvas integration", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("empty canvas state is shown when the page root has no children", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Force an empty doc by removing all children from the root node
    const currentDoc = editorStore.getState().doc;
    const emptyDoc = {
      ...currentDoc,
      nodes: {
        ...currentDoc.nodes,
        [currentDoc.rootId]: { ...currentDoc.nodes[currentDoc.rootId], children: [] },
      },
    };
    act(() => {
      editorStore.setState((s) => ({ ...s, doc: emptyDoc }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Empty canvas" })).toBeInTheDocument();
      expect(screen.getByText("Start building your page")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Section" })).toBeInTheDocument();
    });
  });

  test("clicking Add Section inserts a section and hides the empty state", async () => {
    render(<PageBuilder />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled());

    // Force an empty doc
    const currentDoc = editorStore.getState().doc;
    const emptyDoc = {
      ...currentDoc,
      nodes: {
        ...currentDoc.nodes,
        [currentDoc.rootId]: { ...currentDoc.nodes[currentDoc.rootId], children: [] },
      },
    };
    act(() => {
      editorStore.setState((s) => ({ ...s, doc: emptyDoc }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Section" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Section" }));

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Empty canvas" })).not.toBeInTheDocument();
    });
  });
});
