import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { DragPayload } from "@/dnd";
import { editorStore } from "@/store";
import { getShortcutAction, isEditableTarget } from "@/ui/keyboard/shortcuts";

export type PageBuilderDialog = null | "import" | "export" | "shortcuts";
export type PageBuilderMobilePanel = null | "palette" | "inspector";

type Args = {
  dialog: PageBuilderDialog;
  mobilePanel: PageBuilderMobilePanel;
  resetOpen: boolean;
  recoveryOpen: boolean;
  commandPaletteOpen: boolean;
  activeDrag: DragPayload | null;
  setDialog: Dispatch<SetStateAction<PageBuilderDialog>>;
  setMobilePanel: Dispatch<SetStateAction<PageBuilderMobilePanel>>;
  setResetOpen: Dispatch<SetStateAction<boolean>>;
  setRecoveryOpen: Dispatch<SetStateAction<boolean>>;
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  pushToast: (kind: "info" | "error", message: string) => void;
  focusCanvasFrame: () => void;
  canvasFrameRef: RefObject<HTMLDivElement | null>;
};

export function usePageBuilderKeyboardShortcuts(args: Args): void {
  const latestRef = useRef(args);

  useLayoutEffect(() => {
    latestRef.current = args;
  }, [args]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const action = getShortcutAction(e);
      if (!action) return;

      const latest = latestRef.current;
      if (latest.activeDrag) return;

      const isDialogOpen =
        latest.dialog !== null ||
        latest.mobilePanel !== null ||
        latest.resetOpen ||
        latest.recoveryOpen;

      const editableTarget = isEditableTarget(e.target);
      if (editableTarget) {
        const el = e.target as HTMLElement | null;
        const contentEditableAttr = el?.getAttribute("contenteditable");
        const isContentEditable =
          Boolean(el?.isContentEditable) ||
          (contentEditableAttr !== null && contentEditableAttr?.toLowerCase() !== "false");

        // While inline editing (contentEditable), Escape should be handled by the editor itself (cancel) rather than
        // by the global handler (clear selection).
        if (action === "ESCAPE" && isContentEditable) return;

        if (action !== "ESCAPE") return;
      }

      // Command palette: Ctrl+K closes it when open, opens it otherwise
      if (action === "OPEN_COMMAND_PALETTE") {
        const state = editorStore.getState();
        if (state.mode === "preview") return;
        e.preventDefault();
        latest.setCommandPaletteOpen((o) => !o);
        return;
      }

      // While command palette is open, let it handle its own keyboard events
      if (latest.commandPaletteOpen && action !== "ESCAPE") return;

      if (isDialogOpen && action !== "ESCAPE") return;

      const state = editorStore.getState();
      const modeNow = state.mode;
      if (modeNow === "preview" && action !== "ESCAPE" && action !== "TOGGLE_MODE") return;
      if (state.activeTxn && action !== "ESCAPE") return;

      switch (action) {
        case "ESCAPE": {
          if (latest.commandPaletteOpen) {
            e.preventDefault();
            latest.setCommandPaletteOpen(false);
            return;
          }

          if (isDialogOpen) {
            e.preventDefault();
            if (latest.dialog !== null) latest.setDialog(null);
            else if (latest.resetOpen) latest.setResetOpen(false);
            else if (latest.recoveryOpen) latest.setRecoveryOpen(false);
            else if (latest.mobilePanel !== null) latest.setMobilePanel(null);
            return;
          }

          e.preventDefault();
          const d = state.doc;
          // SET_SELECTED also resets selectedIds to single selection.
          state.dispatch({ type: "SET_SELECTED", nodeId: d.rootId });
          state.dispatch({ type: "SET_HOVERED", nodeId: null });
          latest.focusCanvasFrame();
          return;
        }

        case "TOGGLE_MODE": {
          e.preventDefault();
          state.dispatch({ type: "SET_MODE", mode: modeNow === "edit" ? "preview" : "edit" });
          latest.focusCanvasFrame();
          return;
        }

        case "UNDO": {
          e.preventDefault();
          state.undo();
          latest.focusCanvasFrame();
          return;
        }

        case "REDO": {
          e.preventDefault();
          state.redo();
          latest.focusCanvasFrame();
          return;
        }

        case "COPY": {
          e.preventDefault();
          const res = state.copySelected();
          if (!res.ok) latest.pushToast("error", res.error);
          return;
        }

        case "CUT": {
          e.preventDefault();
          const res = state.cutSelected();
          if (!res.ok) {
            latest.pushToast("error", res.error);
            return;
          }
          latest.focusCanvasFrame();
          return;
        }

        case "PASTE": {
          e.preventDefault();
          const res = state.paste();
          if (!res.ok) {
            latest.pushToast("error", res.error);
            return;
          }
          latest.focusCanvasFrame();
          return;
        }

        case "DELETE_SELECTED": {
          e.preventDefault();
          const res = state.deleteSelected();
          if (!res.ok) {
            latest.pushToast("error", res.error);
            return;
          }
          latest.focusCanvasFrame();
          return;
        }

        case "DUPLICATE_SELECTED": {
          e.preventDefault();
          const res = state.duplicateSelected();
          if (!res.ok) {
            latest.pushToast("error", res.error);
            return;
          }
          latest.focusCanvasFrame();
          return;
        }

        case "SELECT_ALL_SIBLINGS": {
          e.preventDefault();
          state.dispatch({ type: "SELECT_SIBLINGS" });
          return;
        }

        case "MOVE_UP":
        case "MOVE_DOWN": {
          e.preventDefault();
          const d = state.doc;
          const id = state.selectedId;
          if (!id || id === d.rootId) return;
          const node = d.nodes[id];
          const parentId = node?.parentId;
          if (!node || !parentId) return;
          const parent = d.nodes[parentId];
          const from = parent?.children.indexOf(id) ?? -1;
          if (!parent || from < 0) return;

          const delta = action === "MOVE_UP" ? -1 : 1;
          const to = from + delta;
          if (to < 0 || to >= parent.children.length) return;

          state.dispatch({ type: "MOVE_NODE", nodeId: id, parentId, index: to }, { historyLabel: "Reorder" });
          latest.focusCanvasFrame();
          return;
        }

        // ── Arrow-key block navigation ─────────────────────────────────────
        case "NAV_UP":
        case "NAV_DOWN":
        case "NAV_LEFT":
        case "NAV_RIGHT":
        case "NAV_ENTER": {
          // Only fire when no input-like element is focused (canvas frame or body)
          const activeEl = document.activeElement as HTMLElement | null;
          const activeTag = (activeEl?.tagName ?? "").toLowerCase();
          if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;
          if (activeEl?.isContentEditable) return;

          const d = state.doc;
          const id = state.selectedId;

          if (action === "NAV_ENTER") {
            if (!id) return;
            const node = d.nodes[id];
            if (!node) return;
            if (node.type === "text") {
              // Inline editing is triggered by double-click on canvas; scrolling into view is sufficient
              const canvasEl = latest.canvasFrameRef.current;
              const textEl = canvasEl?.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
              textEl?.scrollIntoView({ block: "nearest" });
            } else if (node.children.length > 0) {
              // Select first child (same as NAV_RIGHT)
              e.preventDefault();
              state.dispatch({ type: "SET_SELECTED", nodeId: node.children[0] });
            }
            return;
          }

          if (!id) return;
          const node = d.nodes[id];
          if (!node) return;

          if (action === "NAV_LEFT") {
            // Select parent
            if (!node.parentId || id === d.rootId) return;
            e.preventDefault();
            state.dispatch({ type: "SET_SELECTED", nodeId: node.parentId });
            return;
          }

          if (action === "NAV_RIGHT") {
            // Select first child
            if (node.children.length === 0) return;
            e.preventDefault();
            state.dispatch({ type: "SET_SELECTED", nodeId: node.children[0] });
            return;
          }

          // NAV_UP / NAV_DOWN — navigate siblings
          const parentId = node.parentId;
          if (!parentId) return;
          const parent = d.nodes[parentId];
          if (!parent) return;
          const idx = parent.children.indexOf(id);
          if (idx < 0) return;

          const delta = action === "NAV_UP" ? -1 : 1;
          const nextIdx = idx + delta;
          if (nextIdx < 0 || nextIdx >= parent.children.length) return;

          e.preventDefault();
          state.dispatch({ type: "SET_SELECTED", nodeId: parent.children[nextIdx] });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
