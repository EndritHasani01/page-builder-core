import type { Breakpoint, Document, Node, NodeId } from "@/editor-core";

import { canDrop } from "./canDrop";
import type { DragPayload, DropTarget } from "./types";

export type DropIntent = DropTarget & {
  overId: NodeId;
  axis: "x" | "y";
};

export type ComputeIntentResult =
  | { ok: true; intent: DropIntent }
  | { ok: false; overId?: NodeId; reason: string };

function getAxis(doc: Document, containerId: NodeId, breakpoint: Breakpoint): "x" | "y" {
  const node = doc.nodes[containerId];
  if (!node) return "y";
  if (node.type !== "columns") return "y";
  const isSmall = breakpoint === "base" || breakpoint === "sm";
  return isSmall ? "y" : "x";
}

function getNodeElement(nodeId: NodeId): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-node-id="${nodeId}"]`);
  return el instanceof HTMLElement ? el : null;
}

function computeInsertIndexFromPointer(args: {
  doc: Document;
  parentId: NodeId;
  pointer: { x: number; y: number };
  axis: "x" | "y";
}): number {
  const parent = args.doc.nodes[args.parentId];
  if (!parent) return 0;
  if (parent.children.length === 0) return 0;

  const parentEl = getNodeElement(args.parentId);

  const coord = args.axis === "y" ? args.pointer.y : args.pointer.x;

  for (let i = 0; i < parent.children.length; i++) {
    const childId = parent.children[i];
    const el = parentEl ? parentEl.querySelector(`[data-node-id="${childId}"]`) : getNodeElement(childId);
    if (!(el instanceof HTMLElement)) continue;

    const rect = el.getBoundingClientRect();
    const mid = args.axis === "y" ? rect.top + rect.height / 2 : rect.left + rect.width / 2;

    if (coord < mid) return i;
  }

  return parent.children.length;
}

function computeAdjustedIndexForMoveWithinSameParent(args: {
  doc: Document;
  nodeId: NodeId;
  parentId: NodeId;
  rawIndex: number;
}): number {
  const parent = args.doc.nodes[args.parentId];
  if (!parent) return args.rawIndex;
  const from = parent.children.indexOf(args.nodeId);
  if (from === -1) return args.rawIndex;
  if (args.rawIndex > from) return args.rawIndex - 1;
  return args.rawIndex;
}

export function computeDropIntent(args: {
  doc: Document;
  breakpoint: Breakpoint;
  source: DragPayload;
  overContainerId: NodeId | null;
  pointer: { x: number; y: number };
}): ComputeIntentResult {
  if (!args.overContainerId) return { ok: false, reason: "Not over a droppable container." };

  let cursor: NodeId | null = args.overContainerId;
  let lastReason = "Invalid drop target.";
  let firstReason: string | null = null;

  while (cursor) {
    const cursorNode: Node | undefined = args.doc.nodes[cursor];
    if (!cursorNode) {
      lastReason = "Target does not exist.";
      cursor = null;
      break;
    }

    const axis = getAxis(args.doc, cursor, args.breakpoint);
    const rawIndex = computeInsertIndexFromPointer({
      doc: args.doc,
      parentId: cursor,
      pointer: args.pointer,
      axis,
    });

    const index =
      args.source.kind === "node" && cursorNode.children.includes(args.source.nodeId)
        ? computeAdjustedIndexForMoveWithinSameParent({
            doc: args.doc,
            nodeId: args.source.nodeId,
            parentId: cursor,
            rawIndex,
          })
        : rawIndex;

    const res = canDrop(args.doc, args.source, { parentId: cursor, index });
    if (res.ok) {
      return { ok: true, intent: { parentId: cursor, index, overId: cursor, axis } };
    }

    lastReason = res.reason;
    if (cursor === args.overContainerId && firstReason === null) {
      firstReason = res.reason;
    }
    cursor = cursorNode.parentId ?? null;
  }

  return { ok: false, overId: args.overContainerId, reason: firstReason ?? lastReason };
}
