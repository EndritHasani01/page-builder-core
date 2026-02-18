import type { Document, Node, NodeId, Subtree } from "./types";
import { deepClone } from "./deepClone";
import type { IdFactory } from "./ids";

export function cloneSubtree(doc: Document, rootId: NodeId): Subtree {
  const root = doc.nodes[rootId];
  if (!root) {
    throw new Error(`Cannot clone subtree. Node not found: ${rootId}`);
  }

  const nodes: Record<NodeId, Node> = {};
  const stack: NodeId[] = [rootId];

  while (stack.length) {
    const currentId = stack.pop() as NodeId;
    const node = doc.nodes[currentId];
    if (!node) continue;
    if (nodes[currentId]) continue;
    nodes[currentId] = deepClone(node);
    for (const childId of node.children) stack.push(childId);
  }

  return { rootId, nodes };
}

export function remapIds(subtree: Subtree, idFactory: IdFactory): Subtree {
  const idMap = new Map<NodeId, NodeId>();
  for (const oldId of Object.keys(subtree.nodes)) {
    const node = subtree.nodes[oldId];
    idMap.set(oldId, idFactory.nextId(node.type));
  }

  const remappedNodes: Record<NodeId, Node> = {};
  for (const oldId of Object.keys(subtree.nodes)) {
    const node = deepClone(subtree.nodes[oldId]);
    const newId = idMap.get(oldId);
    if (!newId) continue;

    node.id = newId;

    if (node.parentId && idMap.has(node.parentId)) {
      node.parentId = idMap.get(node.parentId) ?? null;
    } else {
      node.parentId = null;
    }

    node.children = node.children.map((childId) => idMap.get(childId)!).filter(Boolean);

    remappedNodes[newId] = node;
  }

  const newRootId = idMap.get(subtree.rootId);
  if (!newRootId) {
    throw new Error("Failed to remap subtree root id.");
  }

  return { rootId: newRootId, nodes: remappedNodes };
}

