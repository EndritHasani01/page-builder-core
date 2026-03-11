import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, validateDocument } from "@/editor-core";
import { editorStore } from "@/store";
import { createWorkspaceDocument } from "@/persistence";

import { PageBuilder } from "../PageBuilder";

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

describe("WorkspaceDashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    // Leave pb:activeDocId unset so the app opens to the dashboard
    resetSingletonStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows the dashboard when no active doc is set", async () => {
    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Page Builder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Page" })).toBeInTheDocument();
  });

  test("shows empty state when there are no documents", async () => {
    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Page Builder")).toBeInTheDocument();
    expect(screen.getByText("Create your first page to get started")).toBeInTheDocument();
  });

  test("shows document cards for all existing documents", async () => {
    // Create three documents before rendering
    createWorkspaceDocument({ title: "Alpha" });
    createWorkspaceDocument({ title: "Beta" });
    createWorkspaceDocument({ title: "Gamma" });

    // Clear activeDocId so we start on the dashboard
    localStorage.removeItem("pb:activeDocId");

    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  test("search filters document cards by title", async () => {
    createWorkspaceDocument({ title: "My Landing Page" });
    createWorkspaceDocument({ title: "About Us" });
    createWorkspaceDocument({ title: "Contact Form" });

    localStorage.removeItem("pb:activeDocId");

    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );

    // All three are visible
    expect(screen.getByText("My Landing Page")).toBeInTheDocument();
    expect(screen.getByText("About Us")).toBeInTheDocument();
    expect(screen.getByText("Contact Form")).toBeInTheDocument();

    // Search for "landing"
    const searchInput = screen.getByTestId("dashboard-search");
    fireEvent.change(searchInput, { target: { value: "landing" } });

    expect(screen.getByText("My Landing Page")).toBeInTheDocument();
    expect(screen.queryByText("About Us")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact Form")).not.toBeInTheDocument();
  });

  test("search is case-insensitive", async () => {
    createWorkspaceDocument({ title: "Portfolio Site" });
    createWorkspaceDocument({ title: "Blog Post" });

    localStorage.removeItem("pb:activeDocId");

    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );

    const searchInput = screen.getByTestId("dashboard-search");
    fireEvent.change(searchInput, { target: { value: "PORTFOLIO" } });

    expect(screen.getByText("Portfolio Site")).toBeInTheDocument();
    expect(screen.queryByText("Blog Post")).not.toBeInTheDocument();
  });

  test("clicking a document card transitions to the editor view", async () => {
    const result = createWorkspaceDocument({ title: "My Doc" });
    if (!result.ok) throw new Error("Failed to create doc");

    localStorage.removeItem("pb:activeDocId");

    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );

    // Click the card
    const card = screen.getByTestId(`doc-card-${result.docId}`);
    fireEvent.click(card);

    // Should transition to editor (Save now button appears in toolbar)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save now" })).toBeInTheDocument(),
    );

    // Dashboard should be gone
    expect(screen.queryByTestId("workspace-dashboard")).not.toBeInTheDocument();
  });

  test("Home button in editor toolbar navigates back to dashboard", async () => {
    createWorkspaceDocument({ title: "My Page" });
    // Set active doc so we start in editor
    const docs = JSON.parse(localStorage.getItem("pb:index:v1") ?? '{"version":1,"docs":[]}') as { docs: Array<{ id: string }> };
    const docId = docs.docs[0]?.id;
    if (docId) localStorage.setItem("pb:activeDocId", docId);

    render(<PageBuilder />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save now" })).toBeEnabled(),
    );

    // Editor is visible
    expect(screen.queryByTestId("workspace-dashboard")).not.toBeInTheDocument();

    // Click Home button
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

    // Dashboard should appear
    await waitFor(() =>
      expect(screen.getByTestId("workspace-dashboard")).toBeInTheDocument(),
    );
  });
});
