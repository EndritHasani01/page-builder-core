import type { Document, Node, NodeId } from "./types";

export function getNode(doc: Document, nodeId: NodeId): Node | undefined {
  return doc.nodes[nodeId];
}

export function getParent(doc: Document, nodeId: NodeId): Node | undefined {
  const node = doc.nodes[nodeId];
  if (!node?.parentId) return undefined;
  return doc.nodes[node.parentId];
}

export function getChildIndex(parent: Node, childId: NodeId): number {
  return parent.children.indexOf(childId);
}

export function wouldCreateCycle(doc: Document, movingNodeId: NodeId, targetParentId: NodeId): boolean {
  const seen = new Set<NodeId>();
  let current: NodeId | null = targetParentId;
  while (current) {
    if (current === movingNodeId) return true;
    if (seen.has(current)) return true; // broken graph; treat as unsafe
    seen.add(current);
    current = doc.nodes[current]?.parentId ?? null;
  }
  return false;
}

export function collectSubtreeIds(doc: Document, rootId: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const seen = new Set<NodeId>();
  const stack: NodeId[] = [rootId];

  while (stack.length) {
    const id = stack.pop() as NodeId;
    if (seen.has(id)) continue;
    const node = doc.nodes[id];
    if (!node) continue;
    seen.add(id);
    out.push(id);
    for (const childId of node.children) stack.push(childId);
  }

  return out;
}

