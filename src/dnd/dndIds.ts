import type { NodeId, NodeType } from "@/editor-core";

export type DndId = string;

export function paletteDragId(nodeType: NodeType): DndId {
  return `palette:${nodeType}`;
}

export function nodeDragId(nodeId: NodeId): DndId {
  return `node:${nodeId}`;
}

export function containerDropId(nodeId: NodeId): DndId {
  return `container:${nodeId}`;
}

export function parsePaletteDragId(id: unknown): NodeType | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith("palette:")) return null;
  const rest = id.slice("palette:".length);
  return rest ? (rest as NodeType) : null;
}

export function parseNodeDragId(id: unknown): NodeId | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith("node:")) return null;
  const rest = id.slice("node:".length);
  return rest ? (rest as NodeId) : null;
}

export function parseContainerDropId(id: unknown): NodeId | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith("container:")) return null;
  const rest = id.slice("container:".length);
  return rest ? (rest as NodeId) : null;
}

export function parseTreeRowDropId(id: unknown): NodeId | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith("tree-row:")) return null;
  const rest = id.slice("tree-row:".length);
  return rest ? (rest as NodeId) : null;
}

