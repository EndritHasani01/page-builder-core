import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ContextMenu } from "./ContextMenu";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextMenu", () => {
  test("renders all action items with their labels", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={onClose}
        items={[
          { kind: "action", label: "Cut", action: vi.fn() },
          { kind: "separator" },
          { kind: "action", label: "Paste", action: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByRole("menuitem", { name: /cut/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /paste/i })).toBeInTheDocument();
    // Separator
    expect(document.querySelector("[role='separator']")).toBeInTheDocument();
  });

  test("calls action and onClose when an item is clicked", () => {
    const onClose = vi.fn();
    const action = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={onClose}
        items={[{ kind: "action", label: "Delete", danger: true, action }]}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(action).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("disabled items do not invoke their action", () => {
    const onClose = vi.fn();
    const action = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={onClose}
        items={[{ kind: "action", label: "Move up", disabled: true, action }]}
      />,
    );

    // Disabled button — click should be a no-op
    const btn = screen.getByRole("menuitem", { name: /move up/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(action).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={onClose}
        items={[{ kind: "action", label: "Copy", action: vi.fn() }]}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("closes when clicking outside the menu", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={onClose}
        items={[{ kind: "action", label: "Copy", action: vi.fn() }]}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("displays keyboard shortcut hints", () => {
    render(
      <ContextMenu
        x={100}
        y={100}
        onClose={vi.fn()}
        items={[{ kind: "action", label: "Cut", shortcut: "Ctrl+X", action: vi.fn() }]}
      />,
    );

    expect(screen.getByText("Ctrl+X")).toBeInTheDocument();
  });
});
