import type { Document, IdFactory, NodeId, NodeType, Subtree } from "@/editor-core";
import { blockRegistry, createNode } from "@/editor-core";

export function buildPaletteSubtree(nodeType: NodeType, idFactory: IdFactory): Subtree {
  if (nodeType === "section") {
    const section = createNode("section", { idFactory, parentId: null });
    const columns = createNode("columns", { idFactory, parentId: section.id });
    const col1 = createNode("column", { idFactory, parentId: columns.id });
    const col2 = createNode("column", { idFactory, parentId: columns.id });

    section.children = [columns.id];
    columns.children = [col1.id, col2.id];

    return {
      rootId: section.id,
      nodes: {
        [section.id]: section,
        [columns.id]: columns,
        [col1.id]: col1,
        [col2.id]: col2,
      },
    };
  }

  if (nodeType === "columns") {
    const columns = createNode("columns", { idFactory, parentId: null });
    const count = columns.props.columns;
    const nodes: Subtree["nodes"] = { [columns.id]: columns };
    const children: NodeId[] = [];
    for (let i = 0; i < count; i++) {
      const col = createNode("column", { idFactory, parentId: columns.id });
      nodes[col.id] = col;
      children.push(col.id);
    }
    columns.children = children;
    return { rootId: columns.id, nodes };
  }

  const node = createNode(nodeType, { idFactory, parentId: null });
  return { rootId: node.id, nodes: { [node.id]: node } };
}

export function findInsertTarget(
  doc: Document,
  selectedId: NodeId | null,
  childType: NodeType,
): { parentId: NodeId; index: number } | null {
  const root = doc.nodes[doc.rootId];
  if (!root) return null;

  const startId = selectedId ?? doc.rootId;
  let cursor = doc.nodes[startId] ?? root;

  if (canAcceptChild(doc, cursor.id, childType)) {
    return { parentId: cursor.id, index: cursor.children.length };
  }

  while (cursor.parentId) {
    const parent = doc.nodes[cursor.parentId];
    if (!parent) return null;

    if (canAcceptChild(doc, parent.id, childType)) {
      const idx = parent.children.indexOf(cursor.id);
      return { parentId: parent.id, index: idx >= 0 ? idx + 1 : parent.children.length };
    }

    cursor = parent;
  }

  if (canAcceptChild(doc, doc.rootId, childType)) {
    return { parentId: doc.rootId, index: doc.nodes[doc.rootId]?.children.length ?? 0 };
  }

  return null;
}

function canAcceptChild(doc: Document, parentId: NodeId, childType: NodeType): boolean {
  const parent = doc.nodes[parentId];
  if (!parent) return false;
  if (parent.constraints?.locked) return false;
  if (parent.constraints?.droppable === false) return false;
  if (parent.type === "columns") return false;

  const def = blockRegistry[parent.type];
  if (!def.allowedChildren.includes(childType)) return false;

  if (def.constraints?.exactChildren !== undefined) {
    return parent.children.length < def.constraints.exactChildren;
  }
  if (def.constraints?.maxChildren !== undefined) {
    return parent.children.length < def.constraints.maxChildren;
  }
  return true;
}

export function describeNodeForA11y(doc: Document, nodeId: NodeId): string {
  const node = doc.nodes[nodeId];
  if (!node) return "Missing node";

  let label = blockRegistry[node.type]?.label ?? node.type;

  if (node.type === "column" && node.parentId) {
    const parent = doc.nodes[node.parentId];
    if (parent?.type === "columns") {
      const idx = parent.children.indexOf(node.id);
      if (idx >= 0) label = `${label} ${idx + 1}`;
    }
  }

  return label;
}

export function buildSelectionBreadcrumb(doc: Document, selectedId: NodeId | null): string {
  const root = doc.nodes[doc.rootId];
  if (!root) return "Selection: Missing Page root";

  const startId = selectedId && doc.nodes[selectedId] ? selectedId : doc.rootId;
  const visited = new Set<NodeId>();
  const path: NodeId[] = [];

  let cursor: NodeId | null = startId;
  while (cursor) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    path.push(cursor);
    cursor = doc.nodes[cursor]?.parentId ?? null;
  }

  path.reverse();
  return `Selection: ${path.map((id) => describeNodeForA11y(doc, id)).join(" > ")}`;
}

export function sanitizeFilename(input: string): string {
  const trimmed = input.trim() || "page";
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function formatShortTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

