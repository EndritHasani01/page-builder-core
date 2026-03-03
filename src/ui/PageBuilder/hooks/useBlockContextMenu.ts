import { useCallback, useState } from "react";

import type { NodeId } from "@/editor-core";
import { editorStore } from "@/store";

import type { ContextMenuItem } from "../components/ContextMenu";

type BlockMenuState = { kind: "block"; nodeId: NodeId; x: number; y: number };
type CanvasMenuState = { kind: "canvas"; x: number; y: number };
export type ContextMenuState = BlockMenuState | CanvasMenuState | null;

type Args = {
  pushToast: (kind: "info" | "error", message: string) => void;
  onAddSection: () => void;
  onBrowseTemplates?: () => void;
};

export function useBlockContextMenu(args: Args) {
  const [menu, setMenu] = useState<ContextMenuState>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const onNodeContextMenu = useCallback((nodeId: NodeId, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Select the right-clicked node before showing the menu so actions operate on it.
    editorStore.getState().dispatch({ type: "SET_SELECTED", nodeId });
    setMenu({ kind: "block", nodeId, x: e.clientX, y: e.clientY });
  }, []);

  const onCanvasContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement | null;
      // If the click landed on a node element, let the node's own handler take it.
      if (target?.closest("[data-node-id]")) return;
      setMenu({ kind: "canvas", x: e.clientX, y: e.clientY });
    },
    [],
  );

  const buildBlockMenuItems = useCallback(
    (nodeId: NodeId): ContextMenuItem[] => {
      const state = editorStore.getState();
      const doc = state.doc;
      const node = doc.nodes[nodeId];
      if (!node) return [];

      const isRoot = nodeId === doc.rootId;
      const isLocked = node.constraints?.locked === true;
      const isNotDeletable = node.constraints?.deletable === false;
      const parentId = node.parentId;
      const parent = parentId ? doc.nodes[parentId] : null;
      const siblingIndex = parent ? parent.children.indexOf(nodeId) : -1;
      const isFirst = siblingIndex <= 0;
      const isLast = parent ? siblingIndex >= parent.children.length - 1 : true;

      return [
        {
          kind: "action",
          label: "Cut",
          shortcut: "Ctrl+X",
          disabled: isRoot || isLocked,
          action: () => {
            const res = editorStore.getState().cutSelected();
            if (!res.ok) args.pushToast("error", res.error);
          },
        },
        {
          kind: "action",
          label: "Copy",
          shortcut: "Ctrl+C",
          disabled: isRoot,
          action: () => {
            const res = editorStore.getState().copySelected();
            if (!res.ok) args.pushToast("error", res.error);
          },
        },
        {
          kind: "action",
          label: "Paste below",
          shortcut: "Ctrl+V",
          disabled: state.clipboard === null,
          action: () => {
            const res = editorStore.getState().paste();
            if (!res.ok) args.pushToast("error", res.error);
          },
        },
        { kind: "separator" },
        {
          kind: "action",
          label: "Duplicate",
          shortcut: "Ctrl+D",
          disabled: isRoot || isLocked,
          action: () => {
            editorStore
              .getState()
              .dispatch({ type: "DUPLICATE_NODE", nodeId }, { historyLabel: "Duplicate" });
          },
        },
        {
          kind: "action",
          label: "Delete",
          shortcut: "Delete",
          danger: true,
          disabled: isRoot || isLocked || isNotDeletable,
          action: () => {
            editorStore
              .getState()
              .dispatch({ type: "DELETE_NODE", nodeId }, { historyLabel: "Delete" });
          },
        },
        { kind: "separator" },
        {
          kind: "action",
          label: "Move up",
          disabled: isRoot || isLocked || isFirst || !parent,
          action: () => {
            if (!parent || siblingIndex < 0) return;
            editorStore
              .getState()
              .dispatch(
                { type: "MOVE_NODE", nodeId, parentId: parent.id, index: siblingIndex - 1 },
                { historyLabel: "Reorder" },
              );
          },
        },
        {
          kind: "action",
          label: "Move down",
          disabled: isRoot || isLocked || isLast || !parent,
          action: () => {
            if (!parent || siblingIndex < 0) return;
            editorStore
              .getState()
              .dispatch(
                { type: "MOVE_NODE", nodeId, parentId: parent.id, index: siblingIndex + 1 },
                { historyLabel: "Reorder" },
              );
          },
        },
        { kind: "separator" },
        {
          kind: "action",
          label: node.constraints?.locked ? "Unlock" : "Lock",
          action: () => {
            editorStore
              .getState()
              .dispatch(
                {
                  type: "UPDATE_CONSTRAINTS",
                  nodeId,
                  patch: { locked: !node.constraints?.locked },
                },
                { historyLabel: "Constraints" },
              );
          },
        },
        {
          kind: "action",
          label: node.constraints?.hidden ? "Show" : "Hide",
          action: () => {
            editorStore
              .getState()
              .dispatch(
                {
                  type: "UPDATE_CONSTRAINTS",
                  nodeId,
                  patch: { hidden: !node.constraints?.hidden },
                },
                { historyLabel: "Constraints" },
              );
          },
        },
        {
          kind: "action",
          label: "Save to Library",
          disabled: true,
          action: () => {},
        },
        { kind: "separator" },
        {
          kind: "action",
          label: "Select parent",
          disabled: !parentId || isRoot,
          action: () => {
            if (parentId) {
              editorStore.getState().dispatch({ type: "SET_SELECTED", nodeId: parentId });
            }
          },
        },
      ];
    },
    [args],
  );

  const buildCanvasMenuItems = useCallback((): ContextMenuItem[] => {
    const state = editorStore.getState();
    return [
      {
        kind: "action",
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: state.clipboard === null,
        action: () => {
          const res = editorStore.getState().paste();
          if (!res.ok) args.pushToast("error", res.error);
        },
      },
      { kind: "separator" },
      {
        kind: "action",
        label: "Add Section",
        action: () => {
          args.onAddSection();
        },
      },
      {
        kind: "action",
        label: "Browse Templates",
        disabled: !args.onBrowseTemplates,
        action: () => {
          args.onBrowseTemplates?.();
        },
      },
    ];
  }, [args]);

  return {
    menu,
    closeMenu,
    onNodeContextMenu,
    onCanvasContextMenu,
    buildBlockMenuItems,
    buildCanvasMenuItems,
  };
}
