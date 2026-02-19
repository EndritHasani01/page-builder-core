import { useCallback } from "react";

import type { NodeType } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import { editorStore } from "@/store";

import { buildPaletteSubtree, findInsertTarget } from "../pageBuilderUtils";

export function usePaletteInsertion(args: {
  pushToast: (kind: "info" | "error", message: string) => void;
}): {
  insertFromPalette: (nodeType: NodeType) => void;
} {
  const { pushToast } = args;

  const insertFromPalette = useCallback(
    (nodeType: NodeType) => {
      const state = editorStore.getState();
      if (state.mode === "preview") return;
      if (state.activeTxn) return;

      const subtree = buildPaletteSubtree(nodeType, state.idFactory);
      const target = findInsertTarget(state.doc, state.selectedId, subtree.nodes[subtree.rootId].type);
      if (!target) {
        pushToast("error", `Cannot add ${blockRegistry[nodeType].label} here.`);
        return;
      }

      state.dispatch(
        { type: "INSERT_SUBTREE", parentId: target.parentId, index: target.index, subtree },
        { historyLabel: `Add ${blockRegistry[nodeType].label}` },
      );
    },
    [pushToast],
  );

  return { insertFromPalette };
}

