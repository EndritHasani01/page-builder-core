import { describe, expect, test } from "vitest";

import { getShortcutAction, isEditableTarget } from "./shortcuts";

describe("keyboard shortcuts", () => {
  test("does not treat clicks on text inputs as non-editable", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(isEditableTarget(input)).toBe(true);

    const textarea = document.createElement("textarea");
    expect(isEditableTarget(textarea)).toBe(true);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isEditableTarget(checkbox)).toBe(false);
  });

  test("maps Delete/Backspace to DELETE_SELECTED", () => {
    expect(
      getShortcutAction({
        key: "Delete",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("DELETE_SELECTED");

    expect(
      getShortcutAction({
        key: "Backspace",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("DELETE_SELECTED");
  });

  test("maps mod+Z/shift+Z/Y to UNDO/REDO", () => {
    expect(
      getShortcutAction({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("UNDO");

    expect(
      getShortcutAction({
        key: "Z",
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("REDO");

    expect(
      getShortcutAction({
        key: "y",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("REDO");
  });

  test("maps Alt+ArrowUp/Down to MOVE_UP/MOVE_DOWN", () => {
    expect(
      getShortcutAction({
        key: "ArrowUp",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: true,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("MOVE_UP");

    expect(
      getShortcutAction({
        key: "ArrowDown",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: true,
        isComposing: false,
        defaultPrevented: false,
      }),
    ).toBe("MOVE_DOWN");
  });
});

