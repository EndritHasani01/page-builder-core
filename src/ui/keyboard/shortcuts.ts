export type ShortcutAction =
  | "DELETE_SELECTED"
  | "DUPLICATE_SELECTED"
  | "UNDO"
  | "REDO"
  | "COPY"
  | "CUT"
  | "PASTE"
  | "MOVE_UP"
  | "MOVE_DOWN"
  | "ESCAPE"
  | "TOGGLE_MODE";

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;

  if (el.isContentEditable) return true;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;

  if (tag === "INPUT") {
    const input = el as HTMLInputElement;
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "button" || type === "submit" || type === "reset") {
      return false;
    }
    return true;
  }

  return false;
}

type KeyboardLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing" | "defaultPrevented"
>;

export function getShortcutAction(e: KeyboardLike): ShortcutAction | null {
  if (e.defaultPrevented) return null;
  if (e.isComposing) return null;

  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;

  if (key === "Escape") return "ESCAPE";

  if ((key === "Delete" || key === "Backspace") && !mod && !e.altKey) return "DELETE_SELECTED";

  if (mod && lower === "d") return "DUPLICATE_SELECTED";

  if (mod && key === "Enter") return "TOGGLE_MODE";

  if (mod && lower === "z" && e.shiftKey) return "REDO";
  if (mod && lower === "z") return "UNDO";
  if (mod && lower === "y") return "REDO";

  if (mod && lower === "c") return "COPY";
  if (mod && lower === "x") return "CUT";
  if (mod && lower === "v") return "PASTE";

  if (e.altKey && key === "ArrowUp") return "MOVE_UP";
  if (e.altKey && key === "ArrowDown") return "MOVE_DOWN";

  return null;
}

