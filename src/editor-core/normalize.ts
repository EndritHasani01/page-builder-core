import type { IdFactory } from "./ids";
import { createDeterministicIdFactory, parseDeterministicId } from "./ids";
import { createDefaultDocument } from "./defaults";
import { createNode } from "./nodeFactory";
import { blockRegistry } from "./registry";
import type { Document, NodeId, NodeType, ValidationIssue } from "./types";
import { deepClone } from "./deepClone";

export type NormalizeOptions = {
  idFactory?: IdFactory;
  reportIssue?: (issue: ValidationIssue) => void;
};

function warn(reportIssue: NormalizeOptions["reportIssue"], issue: ValidationIssue) {
  reportIssue?.(issue);
}

function getIdFactoryForDocument(doc: Document): IdFactory {
  const maxByType: Partial<Record<NodeType, number>> = {};
  for (const id of Object.keys(doc.nodes)) {
    const parsed = parseDeterministicId(id);
    if (!parsed) continue;
    const currentMax = maxByType[parsed.type] ?? 0;
    if (parsed.n > currentMax) maxByType[parsed.type] = parsed.n;
  }

  const startAt: Partial<Record<NodeType, number>> = {};
  for (const type of Object.keys(maxByType) as NodeType[]) {
    startAt[type] = (maxByType[type] ?? 0) + 1;
  }
  return createDeterministicIdFactory({ startAt });
}

function dedupePreserveOrder<T>(items: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function appendChild(doc: Document, parentId: NodeId, childId: NodeId) {
  const parent = doc.nodes[parentId];
  const child = doc.nodes[childId];
  if (!parent || !child) return;
  parent.children.push(childId);
  child.parentId = parentId;
}

function removeChild(doc: Document, parentId: NodeId, childId: NodeId) {
  const parent = doc.nodes[parentId];
  if (!parent) return;
  parent.children = parent.children.filter((id) => id !== childId);
}

function ensureColumnsLayout(
  doc: Document,
  sectionId: NodeId,
  opts: NormalizeOptions,
): { columnsId: NodeId } {
  const section = doc.nodes[sectionId];
  if (!section || section.type !== "section") {
    throw new Error(`ensureColumnsLayout called for non-section node: ${sectionId}`);
  }

  let columnsId = section.children.find((id) => doc.nodes[id]?.type === "columns");
  const idFactory = opts.idFactory ?? getIdFactoryForDocument(doc);

  if (!columnsId) {
    const columns = createNode("columns", { idFactory, parentId: sectionId });
    doc.nodes[columns.id] = columns;
    columnsId = columns.id;
    warn(opts.reportIssue, {
      nodeId: sectionId,
      level: "warning",
      message: "Section layout was missing. A new Columns layout was created.",
      fieldPath: "children",
    });
  }

  section.children = [columnsId];
  doc.nodes[columnsId].parentId = sectionId;

  return { columnsId };
}

function ensureAtLeastOneColumn(doc: Document, columnsId: NodeId, opts: NormalizeOptions): NodeId {
  const columns = doc.nodes[columnsId];
  if (!columns || columns.type !== "columns") {
    throw new Error(`ensureAtLeastOneColumn called for non-columns node: ${columnsId}`);
  }

  const idFactory = opts.idFactory ?? getIdFactoryForDocument(doc);

  const existingColId = columns.children.find((id) => doc.nodes[id]?.type === "column");
  if (existingColId) return existingColId;

  const col = createNode("column", { idFactory, parentId: columnsId });
  doc.nodes[col.id] = col;
  columns.children = [col.id];

  warn(opts.reportIssue, {
    nodeId: columnsId,
    level: "warning",
    message: "Columns had no Column children. A Column was created.",
    fieldPath: "children",
  });

  return col.id;
}

function moveNode(doc: Document, nodeId: NodeId, newParentId: NodeId) {
  const node = doc.nodes[nodeId];
  if (!node) return;
  const oldParentId = node.parentId;
  if (oldParentId) removeChild(doc, oldParentId, nodeId);
  appendChild(doc, newParentId, nodeId);
}

function cleanupGraph(doc: Document, opts: NormalizeOptions) {
  const root = doc.nodes[doc.rootId];
  if (!root) return;

  const reachable = new Set<NodeId>();
  const stack: Array<{ id: NodeId; parentId: NodeId | null }> = [
    { id: doc.rootId, parentId: null },
  ];

  while (stack.length) {
    const { id: currentId, parentId } = stack.pop() as { id: NodeId; parentId: NodeId | null };
    const node = doc.nodes[currentId];
    if (!node) {
      if (parentId) {
        const parent = doc.nodes[parentId];
        if (parent) parent.children = parent.children.filter((id) => id !== currentId);
      }
      continue;
    }

    if (reachable.has(currentId)) {
      if (parentId) {
        const parent = doc.nodes[parentId];
        if (parent) parent.children = parent.children.filter((id) => id !== currentId);
      }
      warn(opts.reportIssue, {
        nodeId: parentId ?? currentId,
        level: "warning",
        message: "Removed duplicate/multi-parent child reference.",
        fieldPath: "children",
      });
      continue;
    }

    reachable.add(currentId);
    node.parentId = parentId;

    node.children = dedupePreserveOrder(node.children).filter((childId) => {
      if (childId === currentId) {
        warn(opts.reportIssue, {
          nodeId: currentId,
          level: "warning",
          message: "Removed self-referential child entry.",
          fieldPath: "children",
        });
        return false;
      }

      if (!doc.nodes[childId]) {
        warn(opts.reportIssue, {
          nodeId: currentId,
          level: "warning",
          message: `Removed missing child reference: ${childId}`,
          fieldPath: "children",
        });
        return false;
      }
      return true;
    });

    for (const childId of node.children) {
      stack.push({ id: childId, parentId: currentId });
    }
  }

  // Remove orphans
  for (const id of Object.keys(doc.nodes)) {
    if (!reachable.has(id)) {
      delete doc.nodes[id];
    }
  }

  // Fix root parentId (in case root existed but was not visited due to corruption)
  if (doc.nodes[doc.rootId]) {
    doc.nodes[doc.rootId].parentId = null;
  }
}

function normalizePage(doc: Document, opts: NormalizeOptions) {
  const page = doc.nodes[doc.rootId];
  if (!page || page.type !== "page") return;

  const sectionIds: NodeId[] = [];
  const strayIds: NodeId[] = [];

  for (const childId of page.children) {
    const child = doc.nodes[childId];
    if (!child) continue;
    if (child.type === "section") sectionIds.push(childId);
    else strayIds.push(childId);
  }

  page.children = dedupePreserveOrder(sectionIds);

  const idFactory = opts.idFactory ?? getIdFactoryForDocument(doc);

  if (page.children.length === 0) {
    const section = createNode("section", { idFactory, parentId: page.id });
    const columns = createNode("columns", { idFactory, parentId: section.id });
    const col1 = createNode("column", { idFactory, parentId: columns.id });
    const col2 = createNode("column", { idFactory, parentId: columns.id });

    section.children = [columns.id];
    columns.children = [col1.id, col2.id];

    doc.nodes[section.id] = section;
    doc.nodes[columns.id] = columns;
    doc.nodes[col1.id] = col1;
    doc.nodes[col2.id] = col2;

    page.children = [section.id];

    warn(opts.reportIssue, {
      nodeId: page.id,
      level: "warning",
      message: "Page had no sections. A default section was created.",
      fieldPath: "children",
    });
  }

  if (strayIds.length > 0) {
    const section = createNode("section", { idFactory, parentId: page.id });
    const columns = createNode("columns", { idFactory, parentId: section.id });
    const col1 = createNode("column", { idFactory, parentId: columns.id });
    const col2 = createNode("column", { idFactory, parentId: columns.id });

    section.children = [columns.id];
    columns.children = [col1.id, col2.id];

    doc.nodes[section.id] = section;
    doc.nodes[columns.id] = columns;
    doc.nodes[col1.id] = col1;
    doc.nodes[col2.id] = col2;

    page.children.push(section.id);

    for (const strayId of strayIds) {
      moveNode(doc, strayId, col1.id);
    }

    warn(opts.reportIssue, {
      nodeId: page.id,
      level: "warning",
      message: "Non-section children were moved into a new Section.",
      fieldPath: "children",
    });
  }
}

function normalizeSections(doc: Document, opts: NormalizeOptions) {
  const page = doc.nodes[doc.rootId];
  if (!page || page.type !== "page") return;

  for (const sectionId of page.children) {
    const section = doc.nodes[sectionId];
    if (!section || section.type !== "section") continue;

    const originalChildren = [...section.children];
    const { columnsId } = ensureColumnsLayout(doc, sectionId, opts);
    const columns = doc.nodes[columnsId];

    const extras = originalChildren.filter((id) => id !== columnsId && doc.nodes[id]);
    if (extras.length > 0) {
      const firstColumnId = ensureAtLeastOneColumn(doc, columnsId, opts);
      for (const childId of extras) moveNode(doc, childId, firstColumnId);
      warn(opts.reportIssue, {
        nodeId: sectionId,
        level: "warning",
        message: "Section children were moved into the first column to restore a single layout child.",
        fieldPath: "children",
      });
    }

    // Ensure columns is the only child
    section.children = [columnsId];
    columns.parentId = sectionId;
  }
}

function normalizeColumns(doc: Document, opts: NormalizeOptions) {
  for (const node of Object.values(doc.nodes)) {
    if (node.type !== "columns") continue;

    // Clamp columns count
    const raw = node.props.columns;
    const clamped = Number.isFinite(raw) ? Math.max(2, Math.min(6, Math.trunc(raw))) : 2;
    if (clamped !== raw) {
      node.props.columns = clamped;
      warn(opts.reportIssue, {
        nodeId: node.id,
        level: "warning",
        message: "Columns count was invalid and has been clamped to the supported range (2-6).",
        fieldPath: "props.columns",
      });
    }

    const columnIds = node.children.filter((id) => doc.nodes[id]?.type === "column");
    const strayIds = node.children.filter((id) => doc.nodes[id] && doc.nodes[id]?.type !== "column");
    node.children = dedupePreserveOrder(columnIds);

    const firstColumnId = ensureAtLeastOneColumn(doc, node.id, opts);
    for (const strayId of strayIds) {
      moveNode(doc, strayId, firstColumnId);
    }
    if (strayIds.length > 0) {
      warn(opts.reportIssue, {
        nodeId: node.id,
        level: "warning",
        message: "Non-column children were moved into the first column.",
        fieldPath: "children",
      });
    }

    // Ensure enough columns
    const idFactory = opts.idFactory ?? getIdFactoryForDocument(doc);
    while (node.children.length < node.props.columns) {
      const col = createNode("column", { idFactory, parentId: node.id });
      doc.nodes[col.id] = col;
      node.children.push(col.id);
    }

    // Too many columns: merge content into last kept column, remove extras.
    if (node.children.length > node.props.columns) {
      const keep = node.children.slice(0, node.props.columns);
      const extras = node.children.slice(node.props.columns);
      const lastKeptId = keep[keep.length - 1];
      const lastKept = doc.nodes[lastKeptId];

      for (const extraId of extras) {
        const extra = doc.nodes[extraId];
        if (!extra || extra.type !== "column") continue;
        for (const childId of extra.children) {
          appendChild(doc, lastKeptId, childId);
        }
        extra.children = [];
        delete doc.nodes[extraId];
      }

      if (lastKept && lastKept.type === "column") {
        lastKept.children = dedupePreserveOrder(lastKept.children);
      }

      node.children = keep;

      warn(opts.reportIssue, {
        nodeId: node.id,
        level: "warning",
        message: "Extra columns were merged into the last column and removed.",
        fieldPath: "children",
      });
    }
  }
}

function normalizeLeafChildren(doc: Document, opts: NormalizeOptions) {
  for (const node of Object.values(doc.nodes)) {
    const def = blockRegistry[node.type];
    if (def.allowedChildren.length === 0 && node.children.length > 0) {
      node.children = [];
      warn(opts.reportIssue, {
        nodeId: node.id,
        level: "warning",
        message: "Leaf node had children and was repaired.",
        fieldPath: "children",
      });
      continue;
    }

    if (def.allowedChildren.length > 0) {
      const allowed = new Set(def.allowedChildren);
      const filtered = node.children.filter((id) => {
        const child = doc.nodes[id];
        if (!child) return false;
        return allowed.has(child.type);
      });
      if (filtered.length !== node.children.length) {
        node.children = filtered;
        warn(opts.reportIssue, {
          nodeId: node.id,
          level: "warning",
          message: "Removed invalid child node types.",
          fieldPath: "children",
        });
      }
    }
  }
}

export function normalizeDocument(input: Document, opts: NormalizeOptions = {}): Document {
  const doc = deepClone(input);

  const root = doc.nodes[doc.rootId];
  if (!root || root.type !== "page") {
    warn(opts.reportIssue, {
      nodeId: doc.rootId,
      level: "warning",
      message: "Invalid root. A new default document was created.",
      fieldPath: "rootId",
    });
    return createDefaultDocument();
  }

  if (!opts.idFactory) {
    opts.idFactory = getIdFactoryForDocument(doc);
  }

  cleanupGraph(doc, opts);
  normalizePage(doc, opts);
  normalizeSections(doc, opts);
  normalizeColumns(doc, opts);
  normalizeLeafChildren(doc, opts);

  // Final orphan cleanup after structural changes
  cleanupGraph(doc, opts);

  return doc;
}
