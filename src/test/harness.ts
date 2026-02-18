import type { Document, IdFactory, NodeId, NodeType } from "@/editor-core";
import { createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";

export const TEST_NOW_ISO = "2026-02-18T12:00:00.000Z";
export const TEST_NOW = new Date(TEST_NOW_ISO);

export function createTestDocument(now: Date = TEST_NOW): Document {
  return createDefaultDocument(now);
}

export function createTestIdFactory(
  startAt?: Partial<Record<NodeType, number>>,
): IdFactory {
  // Use counters that are safely beyond the default document ids.
  return createDeterministicIdFactory({
    startAt: {
      page: 10,
      section: 10,
      columns: 10,
      column: 10,
      container: 10,
      text: 10,
      image: 10,
      button: 10,
      spacer: 10,
      divider: 10,
      ...(startAt ?? {}),
    },
  });
}

export function attachChild(doc: Document, parentId: NodeId, childId: NodeId) {
  const parent = doc.nodes[parentId];
  const child = doc.nodes[childId];
  if (!parent || !child) {
    throw new Error(`attachChild: missing nodes (${parentId} -> ${childId})`);
  }
  parent.children = [...parent.children, childId];
  child.parentId = parentId;
}

export function createChildNode<T extends NodeType>(args: {
  doc: Document;
  parentId: NodeId;
  type: T;
  id: NodeId;
  props?: NonNullable<Parameters<typeof createNode<T>>[1]>["props"];
}) {
  const node = createNode(args.type, { id: args.id, parentId: args.parentId, props: args.props });
  args.doc.nodes[node.id] = node;
  attachChild(args.doc, args.parentId, node.id);
  return node;
}
