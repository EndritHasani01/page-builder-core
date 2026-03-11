import type { EditorState, EditorStore } from "@/store";
import { buildPaletteSubtree, findInsertTarget } from "./pageBuilderUtils";

export type ActionContext = {
  pushToast: (kind: "info" | "error" | "success", message: string) => void;
  openDialog?: (d: "import" | "export" | "shortcuts") => void;
  focusCanvasFrame?: () => void;
};

export interface EditorAction {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  when?: (state: EditorState) => boolean;
  execute: (store: EditorStore, ctx: ActionContext) => void;
}

const notPreview = (s: EditorState) => s.mode !== "preview";
const notRoot = (s: EditorState) => s.selectedId !== null && s.selectedId !== s.doc.rootId;

function insertBlock(type: Parameters<typeof buildPaletteSubtree>[0]) {
  return (store: EditorStore, ctx: ActionContext) => {
    const state = store.getState();
    if (state.mode === "preview" || state.activeTxn) return;
    const subtree = buildPaletteSubtree(type, state.idFactory);
    const target = findInsertTarget(state.doc, state.selectedId, subtree.nodes[subtree.rootId].type);
    if (!target) {
      ctx.pushToast("error", `Cannot insert ${type} here.`);
      return;
    }
    state.dispatch(
      { type: "INSERT_SUBTREE", parentId: target.parentId, index: target.index, subtree },
      { historyLabel: `Add ${type}` },
    );
  };
}

export const EDITOR_ACTIONS: EditorAction[] = [
  // ── Insert ────────────────────────────────────────────────────────────────
  {
    id: "add-section",
    label: "Add Section",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("section"),
  },
  {
    id: "add-text",
    label: "Add Text",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("text"),
  },
  {
    id: "add-image",
    label: "Add Image",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("image"),
  },
  {
    id: "add-button",
    label: "Add Button",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("button"),
  },
  {
    id: "add-columns",
    label: "Add Columns",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("columns"),
  },
  {
    id: "add-container",
    label: "Add Container",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("container"),
  },
  {
    id: "add-spacer",
    label: "Add Spacer",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("spacer"),
  },
  {
    id: "add-divider",
    label: "Add Divider",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("divider"),
  },
  {
    id: "add-video",
    label: "Add Video",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("video"),
  },
  {
    id: "add-embed",
    label: "Add Embed",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("embed"),
  },
  {
    id: "add-icon",
    label: "Add Icon",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("icon"),
  },
  {
    id: "add-form",
    label: "Add Form",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("form"),
  },
  {
    id: "add-text-input",
    label: "Add Text Input",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("textInput"),
  },
  {
    id: "add-textarea",
    label: "Add Textarea",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("textarea"),
  },
  {
    id: "add-select",
    label: "Add Select",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("selectInput"),
  },
  {
    id: "add-checkbox",
    label: "Add Checkbox",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("checkbox"),
  },
  {
    id: "add-radio-group",
    label: "Add Radio Group",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("radioGroup"),
  },
  {
    id: "add-submit-button",
    label: "Add Submit Button",
    category: "Insert",
    when: notPreview,
    execute: insertBlock("submitButton"),
  },

  // ── Edit ──────────────────────────────────────────────────────────────────
  {
    id: "undo",
    label: "Undo",
    shortcut: "Ctrl+Z",
    category: "Edit",
    when: (s) => s.undoStack.length > 0,
    execute: (store, ctx) => {
      store.getState().undo();
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "redo",
    label: "Redo",
    shortcut: "Ctrl+Shift+Z",
    category: "Edit",
    when: (s) => s.redoStack.length > 0,
    execute: (store, ctx) => {
      store.getState().redo();
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "cut",
    label: "Cut",
    shortcut: "Ctrl+X",
    category: "Edit",
    when: notRoot,
    execute: (store, ctx) => {
      const res = store.getState().cutSelected();
      if (!res.ok) ctx.pushToast("error", res.error);
      else ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "copy",
    label: "Copy",
    shortcut: "Ctrl+C",
    category: "Edit",
    when: notRoot,
    execute: (store, ctx) => {
      const res = store.getState().copySelected();
      if (!res.ok) ctx.pushToast("error", res.error);
    },
  },
  {
    id: "paste",
    label: "Paste",
    shortcut: "Ctrl+V",
    category: "Edit",
    when: (s) => s.clipboard !== null && notPreview(s),
    execute: (store, ctx) => {
      const res = store.getState().paste();
      if (!res.ok) ctx.pushToast("error", res.error);
      else ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "duplicate",
    label: "Duplicate",
    shortcut: "Ctrl+D",
    category: "Edit",
    when: (s) => notRoot(s) && notPreview(s),
    execute: (store, ctx) => {
      const res = store.getState().duplicateSelected();
      if (!res.ok) ctx.pushToast("error", res.error);
      else ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "delete",
    label: "Delete",
    shortcut: "Delete",
    category: "Edit",
    when: (s) => notRoot(s) && notPreview(s),
    execute: (store, ctx) => {
      const res = store.getState().deleteSelected();
      if (!res.ok) ctx.pushToast("error", res.error);
      else ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "select-parent",
    label: "Select Parent",
    shortcut: "←",
    category: "Edit",
    when: notRoot,
    execute: (store, ctx) => {
      const state = store.getState();
      const node = state.doc.nodes[state.selectedId ?? ""];
      if (node?.parentId) {
        state.dispatch({ type: "SET_SELECTED", nodeId: node.parentId });
        ctx.focusCanvasFrame?.();
      }
    },
  },
  {
    id: "select-all-siblings",
    label: "Select All Siblings",
    shortcut: "Ctrl+A",
    category: "Edit",
    when: notRoot,
    execute: (store, ctx) => {
      store.getState().dispatch({ type: "SELECT_SIBLINGS" });
      ctx.focusCanvasFrame?.();
    },
  },

  // ── View ──────────────────────────────────────────────────────────────────
  {
    id: "toggle-preview",
    label: "Toggle Preview",
    shortcut: "Ctrl+Enter",
    category: "View",
    execute: (store, ctx) => {
      const state = store.getState();
      state.dispatch({ type: "SET_MODE", mode: state.mode === "edit" ? "preview" : "edit" });
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "breakpoint-base",
    label: "Switch to Base Breakpoint",
    category: "View",
    when: (s) => s.breakpoint !== "base",
    execute: (store, ctx) => {
      store.getState().dispatch({ type: "SET_BREAKPOINT", breakpoint: "base" });
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "breakpoint-sm",
    label: "Switch to SM Breakpoint",
    category: "View",
    when: (s) => s.breakpoint !== "sm",
    execute: (store, ctx) => {
      store.getState().dispatch({ type: "SET_BREAKPOINT", breakpoint: "sm" });
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "breakpoint-md",
    label: "Switch to MD Breakpoint",
    category: "View",
    when: (s) => s.breakpoint !== "md",
    execute: (store, ctx) => {
      store.getState().dispatch({ type: "SET_BREAKPOINT", breakpoint: "md" });
      ctx.focusCanvasFrame?.();
    },
  },
  {
    id: "breakpoint-lg",
    label: "Switch to LG Breakpoint",
    category: "View",
    when: (s) => s.breakpoint !== "lg",
    execute: (store, ctx) => {
      store.getState().dispatch({ type: "SET_BREAKPOINT", breakpoint: "lg" });
      ctx.focusCanvasFrame?.();
    },
  },

  // ── Export ────────────────────────────────────────────────────────────────
  {
    id: "export-json",
    label: "Export JSON",
    category: "Export",
    execute: (_store, ctx) => ctx.openDialog?.("export"),
  },
  {
    id: "import-json",
    label: "Import JSON",
    category: "Export",
    when: notPreview,
    execute: (_store, ctx) => ctx.openDialog?.("import"),
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  {
    id: "open-shortcuts",
    label: "Open Shortcuts Help",
    shortcut: "?",
    category: "Navigation",
    execute: (_store, ctx) => ctx.openDialog?.("shortcuts"),
  },
];

export function getAction(id: string): EditorAction | undefined {
  return EDITOR_ACTIONS.find((a) => a.id === id);
}
