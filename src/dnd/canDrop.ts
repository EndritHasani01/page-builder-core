import type { Document, Node, NodeType } from "@/editor-core";
import { blockRegistry, wouldCreateCycle } from "@/editor-core";

import type { DragPayload, DropTarget } from "./types";

export type CanDropResult = { ok: true } | { ok: false; reason: string };

function isLocked(node: Node | undefined): boolean {
  return Boolean(node?.constraints?.locked);
}

function isDroppable(node: Node | undefined): boolean {
  if (!node) return false;
  if (isLocked(node)) return false;
  return node.constraints?.droppable !== false;
}

function isDraggable(node: Node | undefined): boolean {
  if (!node) return false;
  if (isLocked(node)) return false;
  return node.constraints?.draggable !== false;
}

function canHaveMoreChildren(parent: Node): boolean {
  const def = blockRegistry[parent.type];
  const exact = def.constraints?.exactChildren;
  if (exact !== undefined) return parent.children.length < exact;
  const max = def.constraints?.maxChildren;
  if (max !== undefined) return parent.children.length < max;
  return true;
}

function childTypeForSource(doc: Document, source: DragPayload): NodeType | null {
  if (source.kind === "palette") return source.nodeType;
  const node = doc.nodes[source.nodeId];
  return node?.type ?? null;
}

export function canDrop(doc: Document, source: DragPayload, target: DropTarget): CanDropResult {
  const targetParent = doc.nodes[target.parentId];
  if (!targetParent) return { ok: false, reason: "Target parent does not exist." };
  if (!isDroppable(targetParent)) return { ok: false, reason: "Target parent is not droppable." };

  const childType = childTypeForSource(doc, source);
  if (!childType) return { ok: false, reason: "Dragged node does not exist." };

  if (targetParent.type === "columns" && childType !== "column") {
    return { ok: false, reason: "Cannot insert into Columns directly." };
  }

  if (source.kind === "palette") {
    if (!blockRegistry[targetParent.type].allowedChildren.includes(childType)) {
      return { ok: false, reason: `Cannot drop "${childType}" into "${targetParent.type}".` };
    }
    if (!canHaveMoreChildren(targetParent)) {
      return { ok: false, reason: "Target parent cannot accept more children." };
    }
    return { ok: true };
  }

  const node = doc.nodes[source.nodeId];
  if (!node) return { ok: false, reason: "Dragged node does not exist." };
  if (node.id === doc.rootId) return { ok: false, reason: "Cannot move the root node." };
  if (!isDraggable(node)) return { ok: false, reason: "This node cannot be moved." };

  if (wouldCreateCycle(doc, node.id, targetParent.id)) {
    return { ok: false, reason: "Cannot move a node into its own subtree." };
  }

  if (node.type === "column") {
    if (node.parentId !== targetParent.id || targetParent.type !== "columns") {
      return {
        ok: false,
        reason: "Columns cannot be moved between layouts. Change the columns count instead.",
      };
    }
    return { ok: true };
  }

  const oldParent = node.parentId ? doc.nodes[node.parentId] : undefined;
  if (oldParent && oldParent.id !== targetParent.id) {
    const oldDef = blockRegistry[oldParent.type];
    if (oldDef.constraints?.exactChildren !== undefined && oldParent.children.length <= oldDef.constraints.exactChildren) {
      return { ok: false, reason: "Cannot move this node because it is required by its parent structure." };
    }
  }

  if (!blockRegistry[targetParent.type].allowedChildren.includes(node.type)) {
    return { ok: false, reason: `Cannot drop "${node.type}" into "${targetParent.type}".` };
  }

  if (node.parentId !== targetParent.id && !canHaveMoreChildren(targetParent)) {
    return { ok: false, reason: "Target parent cannot accept more children." };
  }

  return { ok: true };
}
