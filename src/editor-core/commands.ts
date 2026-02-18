import { enablePatches, produceWithPatches, type Draft } from "immer";

import type { IdFactory } from "./ids";
import { createNanoidFactory } from "./ids";
import { blockRegistry } from "./registry";
import { createNode } from "./nodeFactory";
import { cloneSubtree, remapIds } from "./subtree";
import { collectSubtreeIds, getChildIndex, getNode, wouldCreateCycle } from "./graph";
import type {
  Breakpoint,
  Document,
  Node,
  NodeId,
  NodePropsByType,
  NodeType,
  StyleProps,
  Subtree,
  ValidationIssue,
} from "./types";
import { validateDocument } from "./validate";

export type DocCommand =
  | {
      type: "ADD_NODE";
      parentId: NodeId;
      index?: number;
      nodeType: NodeType;
      initialProps?: Partial<NodePropsByType[NodeType]>;
      id?: NodeId;
    }
  | { type: "MOVE_NODE"; nodeId: NodeId; parentId: NodeId; index: number }
  | { type: "DELETE_NODE"; nodeId: NodeId }
  | { type: "DUPLICATE_NODE"; nodeId: NodeId; parentId?: NodeId; index?: number }
  | { type: "UPDATE_PROPS"; nodeId: NodeId; patch: Record<string, unknown> }
  | { type: "UPDATE_STYLE"; nodeId: NodeId; breakpoint: Breakpoint; patch: Partial<StyleProps> }
  | { type: "SET_COLUMNS"; nodeId: NodeId; columns: number }
  | { type: "INSERT_SUBTREE"; parentId: NodeId; index?: number; subtree: Subtree };

export type ApplyDocCommandResult = {
  doc: Document;
  issues: ValidationIssue[];
  changed: boolean;
  createdNodeId?: NodeId;
  deletedNodeIds?: NodeId[];
};

type ApplyCtx = {
  idFactory: IdFactory;
  issues: ValidationIssue[];
  createdNodeId?: NodeId;
  deletedNodeIds?: NodeId[];
};

type DraftDoc = Draft<Document>;

const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const STYLE_KEYS: Array<keyof StyleProps> = [
  "display",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  "padding",
  "margin",
  "width",
  "maxWidth",
  "minHeight",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "color",
  "backgroundColor",
  "borderRadius",
  "border",
  "boxShadow",
  "opacity",
];

function pushIssue(ctx: ApplyCtx, issue: ValidationIssue) {
  ctx.issues.push(issue);
}

function isLocked(node: Node | undefined): boolean {
  return Boolean(node?.constraints?.locked);
}

function isDeletable(node: Node | undefined): boolean {
  if (!node) return false;
  if (isLocked(node)) return false;
  return node.constraints?.deletable !== false;
}

function isDraggable(node: Node | undefined): boolean {
  if (!node) return false;
  if (isLocked(node)) return false;
  return node.constraints?.draggable !== false;
}

function isDroppable(node: Node | undefined): boolean {
  if (!node) return false;
  if (isLocked(node)) return false;
  return node.constraints?.droppable !== false;
}

function clampIndex(index: number, length: number): number {
  if (Number.isNaN(index) || !Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

function canHaveMoreChildren(parent: Node): boolean {
  const def = blockRegistry[parent.type];
  const exact = def.constraints?.exactChildren;
  if (exact !== undefined) return parent.children.length < exact;
  const max = def.constraints?.maxChildren;
  if (max !== undefined) return parent.children.length < max;
  return true;
}

function removeFromParent(doc: DraftDoc, nodeId: NodeId) {
  const node = doc.nodes[nodeId];
  if (!node?.parentId) return;
  const parent = doc.nodes[node.parentId];
  if (!parent) return;
  parent.children = parent.children.filter((id) => id !== nodeId);
}

function insertIntoParent(doc: DraftDoc, parentId: NodeId, childId: NodeId, index?: number) {
  const parent = doc.nodes[parentId];
  const child = doc.nodes[childId];
  if (!parent || !child) return;

  const nextIndex = clampIndex(index ?? parent.children.length, parent.children.length);
  parent.children.splice(nextIndex, 0, childId);
  child.parentId = parentId;
}

function moveWithinParent(doc: DraftDoc, parent: Node, nodeId: NodeId, index: number) {
  const from = parent.children.indexOf(nodeId);
  if (from === -1) return;
  const target = clampIndex(index, parent.children.length - 1);
  if (from === target) return;
  parent.children.splice(from, 1);
  parent.children.splice(target, 0, nodeId);
}

function isManagedColumn(doc: Document, node: Node): boolean {
  return node.type === "column" && Boolean(node.parentId) && doc.nodes[node.parentId!]?.type === "columns";
}

function setColumnsCount(doc: DraftDoc, ctx: ApplyCtx, columnsId: NodeId, columnsCount: number) {
  const node = doc.nodes[columnsId];
  if (!node || node.type !== "columns") {
    pushIssue(ctx, {
      nodeId: columnsId,
      level: "error",
      message: "SET_COLUMNS can only be applied to a Columns node.",
    });
    return;
  }
  if (isLocked(node)) {
    pushIssue(ctx, {
      nodeId: columnsId,
      level: "error",
      message: "This Columns node is locked.",
    });
    return;
  }

  const desiredRaw = Number.isFinite(columnsCount) ? Math.trunc(columnsCount) : 2;
  const clamped = Math.max(2, Math.min(6, desiredRaw));

  const columnIds = node.children.filter((id) => doc.nodes[id]?.type === "column");
  const strayIds = node.children.filter((id) => doc.nodes[id] && doc.nodes[id]?.type !== "column");
  node.children = [...columnIds];

  if (node.children.length === 0) {
    const col = createNode("column", { idFactory: ctx.idFactory, parentId: node.id });
    doc.nodes[col.id] = col;
    node.children.push(col.id);
  }

  const firstColId = node.children[0];
  if (firstColId && strayIds.length > 0) {
    const firstCol = doc.nodes[firstColId];
    if (firstCol?.type === "column") {
      for (const strayId of strayIds) {
        const stray = doc.nodes[strayId];
        if (!stray) continue;
        removeFromParent(doc, strayId);
        insertIntoParent(doc, firstColId, strayId, firstCol.children.length);
      }
    }
  }

  const currentCount = node.children.length;

  if (clamped < currentCount) {
    const keep = node.children.slice(0, clamped);
    const extras = node.children.slice(clamped);
    const lastKeptId = keep[keep.length - 1];
    const lastKept = doc.nodes[lastKeptId];

    if (lastKept?.constraints?.locked) {
      pushIssue(ctx, {
        nodeId: lastKeptId,
        level: "error",
        message: "Cannot reduce columns because the destination column is locked.",
      });
      return;
    }

    const lockedExtra = extras.find((id) => doc.nodes[id]?.constraints?.locked);
    if (lockedExtra) {
      pushIssue(ctx, {
        nodeId: lockedExtra,
        level: "error",
        message: "Cannot reduce columns because a column to be removed is locked.",
      });
      return;
    }
  }

  // Commit count once we know the operation is feasible.
  node.props.columns = clamped;

  // Ensure enough columns
  while (node.children.length < clamped) {
    const col = createNode("column", { idFactory: ctx.idFactory, parentId: node.id });
    doc.nodes[col.id] = col;
    node.children.push(col.id);
  }

  // Reduce columns by merging removed columns into last kept column.
  if (node.children.length > clamped) {
    const keep = node.children.slice(0, clamped);
    const extras = node.children.slice(clamped);
    const lastKeptId = keep[keep.length - 1];

    for (const extraId of extras) {
      const extra = doc.nodes[extraId];
      if (!extra || extra.type !== "column") continue;
      for (const childId of extra.children) {
        insertIntoParent(doc, lastKeptId, childId, doc.nodes[lastKeptId]?.children.length);
      }
      delete doc.nodes[extraId];
    }
    node.children = keep;
  }
}

function applyAddNode(doc: DraftDoc, ctx: ApplyCtx, cmd: Extract<DocCommand, { type: "ADD_NODE" }>) {
  const parent = doc.nodes[cmd.parentId];
  if (!parent) {
    pushIssue(ctx, {
      nodeId: cmd.parentId,
      level: "error",
      message: "Parent node does not exist.",
    });
    return;
  }
  if (!isDroppable(parent)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "Cannot add a child to this node.",
    });
    return;
  }
  if (parent.type === "columns") {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "Columns children are managed by the columns count. Use SET_COLUMNS instead.",
      fieldPath: "children",
    });
    return;
  }
  if (!blockRegistry[parent.type].allowedChildren.includes(cmd.nodeType)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: `Cannot add "${cmd.nodeType}" inside "${parent.type}".`,
      fieldPath: "children",
    });
    return;
  }
  if (!canHaveMoreChildren(parent)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "This node cannot accept more children.",
      fieldPath: "children",
    });
    return;
  }

  const node = createNode(cmd.nodeType, {
    id: cmd.id,
    idFactory: ctx.idFactory,
    parentId: parent.id,
    props: cmd.initialProps as never,
  });
  doc.nodes[node.id] = node as Node;
  insertIntoParent(doc, parent.id, node.id, cmd.index);
  ctx.createdNodeId = node.id;
}

function applyInsertSubtree(
  doc: DraftDoc,
  ctx: ApplyCtx,
  cmd: Extract<DocCommand, { type: "INSERT_SUBTREE" }>,
) {
  const parent = doc.nodes[cmd.parentId];
  if (!parent) {
    pushIssue(ctx, {
      nodeId: cmd.parentId,
      level: "error",
      message: "Parent node does not exist.",
    });
    return;
  }
  if (!isDroppable(parent)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "Cannot drop content into this node.",
    });
    return;
  }
  if (parent.type === "columns") {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "Columns children are managed by the columns count.",
      fieldPath: "children",
    });
    return;
  }

  const root = cmd.subtree.nodes[cmd.subtree.rootId];
  if (!root) {
    pushIssue(ctx, {
      nodeId: cmd.parentId,
      level: "error",
      message: "Subtree root node is missing.",
    });
    return;
  }

  if (!blockRegistry[parent.type].allowedChildren.includes(root.type)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: `Cannot insert "${root.type}" inside "${parent.type}".`,
      fieldPath: "children",
    });
    return;
  }
  if (!canHaveMoreChildren(parent)) {
    pushIssue(ctx, {
      nodeId: parent.id,
      level: "error",
      message: "This node cannot accept more children.",
      fieldPath: "children",
    });
    return;
  }

  for (const id of Object.keys(cmd.subtree.nodes)) {
    if (doc.nodes[id]) {
      pushIssue(ctx, {
        nodeId: id,
        level: "error",
        message: "Subtree id collision. Refuse to insert.",
      });
      return;
    }
  }

  // Insert nodes
  for (const id of Object.keys(cmd.subtree.nodes)) {
    const n = cmd.subtree.nodes[id];
    doc.nodes[id] = {
      ...n,
      children: [...n.children].filter((childId) => Boolean(cmd.subtree.nodes[childId])),
    } as Node;
  }

  const insertedRoot = doc.nodes[root.id];
  insertedRoot.parentId = parent.id;
  insertIntoParent(doc, parent.id, insertedRoot.id, cmd.index);
  ctx.createdNodeId = insertedRoot.id;
}

function applyMoveNode(doc: DraftDoc, ctx: ApplyCtx, cmd: Extract<DocCommand, { type: "MOVE_NODE" }>) {
  const node = doc.nodes[cmd.nodeId];
  if (!node) {
    pushIssue(ctx, { nodeId: cmd.nodeId, level: "error", message: "Node does not exist." });
    return;
  }
  if (node.id === doc.rootId) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Cannot move the root node." });
    return;
  }
  if (!isDraggable(node)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "This node cannot be moved." });
    return;
  }

  const targetParent = doc.nodes[cmd.parentId];
  if (!targetParent) {
    pushIssue(ctx, { nodeId: cmd.parentId, level: "error", message: "Target parent does not exist." });
    return;
  }
  if (!isDroppable(targetParent)) {
    pushIssue(ctx, { nodeId: targetParent.id, level: "error", message: "Target parent is not droppable." });
    return;
  }

  if (wouldCreateCycle(doc as unknown as Document, node.id, targetParent.id)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Cannot move a node into its own subtree." });
    return;
  }

  // Managed columns: only allow reordering within the same Columns parent.
  if (node.type === "column") {
    if (node.parentId !== targetParent.id || targetParent.type !== "columns") {
      pushIssue(ctx, {
        nodeId: node.id,
        level: "error",
        message: "Columns cannot be moved between layouts. Change the columns count instead.",
      });
      return;
    }
    moveWithinParent(doc, targetParent, node.id, cmd.index);
    return;
  }

  // Prevent breaking exactChildren constraints by moving a required child out.
  const oldParent = node.parentId ? doc.nodes[node.parentId] : undefined;
  if (oldParent && oldParent.id !== targetParent.id) {
    const oldDef = blockRegistry[oldParent.type];
    if (oldDef.constraints?.exactChildren !== undefined && oldParent.children.length <= oldDef.constraints.exactChildren) {
      pushIssue(ctx, {
        nodeId: node.id,
        level: "error",
        message: "Cannot move this node because it is required by its parent structure.",
      });
      return;
    }
  }

  if (targetParent.type === "columns") {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: "Cannot insert into Columns directly. Use the columns count to manage columns.",
    });
    return;
  }

  if (!blockRegistry[targetParent.type].allowedChildren.includes(node.type)) {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: `Cannot move "${node.type}" inside "${targetParent.type}".`,
    });
    return;
  }
  if (!canHaveMoreChildren(targetParent) && node.parentId !== targetParent.id) {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: "Target parent cannot accept more children.",
    });
    return;
  }

  if (node.parentId === targetParent.id) {
    moveWithinParent(doc, targetParent, node.id, cmd.index);
    return;
  }

  removeFromParent(doc, node.id);
  insertIntoParent(doc, targetParent.id, node.id, cmd.index);
}

function applyDeleteNode(doc: DraftDoc, ctx: ApplyCtx, cmd: Extract<DocCommand, { type: "DELETE_NODE" }>) {
  const node = doc.nodes[cmd.nodeId];
  if (!node) {
    pushIssue(ctx, { nodeId: cmd.nodeId, level: "error", message: "Node does not exist." });
    return;
  }
  if (node.id === doc.rootId) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Cannot delete the root node." });
    return;
  }
  if (!isDeletable(node)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "This node cannot be deleted." });
    return;
  }

  // Disallow deleting managed columns directly.
  if (isManagedColumn(doc as unknown as Document, node)) {
    pushIssue(ctx, {
      nodeId: node.id,
      level: "error",
      message: "Columns are managed by the columns count. Use SET_COLUMNS to remove columns.",
    });
    return;
  }

  const parent = node.parentId ? doc.nodes[node.parentId] : undefined;
  if (parent) {
    const def = blockRegistry[parent.type];
    if (def.constraints?.exactChildren !== undefined && parent.children.length <= def.constraints.exactChildren) {
      pushIssue(ctx, {
        nodeId: node.id,
        level: "error",
        message: "Cannot delete this node because it is required by its parent structure.",
      });
      return;
    }
  }

  const ids = collectSubtreeIds(doc as unknown as Document, node.id);
  removeFromParent(doc, node.id);
  for (const id of ids) {
    delete doc.nodes[id];
  }
  ctx.deletedNodeIds = ids;
}

function applyDuplicateNode(
  doc: DraftDoc,
  ctx: ApplyCtx,
  cmd: Extract<DocCommand, { type: "DUPLICATE_NODE" }>,
) {
  const node = doc.nodes[cmd.nodeId];
  if (!node) {
    pushIssue(ctx, { nodeId: cmd.nodeId, level: "error", message: "Node does not exist." });
    return;
  }
  if (node.id === doc.rootId) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Cannot duplicate the root node." });
    return;
  }
  if (isLocked(node)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "This node is locked." });
    return;
  }
  if (node.type === "column") {
    pushIssue(ctx, {
      nodeId: node.id,
      level: "error",
      message: "Columns are managed by the columns count. Duplicate the layout or section instead.",
    });
    return;
  }

  const targetParentId = cmd.parentId ?? node.parentId;
  if (!targetParentId) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Node has no parent to duplicate into." });
    return;
  }

  const targetParent = doc.nodes[targetParentId];
  if (!targetParent || !isDroppable(targetParent)) {
    pushIssue(ctx, { nodeId: targetParentId, level: "error", message: "Target parent is not droppable." });
    return;
  }
  if (targetParent.type === "columns") {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: "Cannot insert into Columns directly.",
    });
    return;
  }
  if (!blockRegistry[targetParent.type].allowedChildren.includes(node.type)) {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: `Cannot duplicate "${node.type}" inside "${targetParent.type}".`,
    });
    return;
  }
  if (!canHaveMoreChildren(targetParent)) {
    pushIssue(ctx, {
      nodeId: targetParent.id,
      level: "error",
      message: "Target parent cannot accept more children.",
    });
    return;
  }

  const parentIndex = targetParent.children.indexOf(node.id);
  const insertIndex = cmd.index ?? (parentIndex >= 0 ? parentIndex + 1 : targetParent.children.length);

  const subtree = cloneSubtree(doc as unknown as Document, node.id);
  const remapped = remapIds(subtree, ctx.idFactory);
  applyInsertSubtree(doc, ctx, {
    type: "INSERT_SUBTREE",
    parentId: targetParent.id,
    index: insertIndex,
    subtree: remapped,
  });
}

function applyUpdateProps(
  doc: DraftDoc,
  ctx: ApplyCtx,
  cmd: Extract<DocCommand, { type: "UPDATE_PROPS" }>,
) {
  const node = doc.nodes[cmd.nodeId];
  if (!node) {
    pushIssue(ctx, { nodeId: cmd.nodeId, level: "error", message: "Node does not exist." });
    return;
  }
  if (isLocked(node)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "This node is locked." });
    return;
  }
  if (!cmd.patch || typeof cmd.patch !== "object") {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Props patch must be an object." });
    return;
  }

  // Special case: columns.columns must keep children in sync.
  if (node.type === "columns" && Object.prototype.hasOwnProperty.call(cmd.patch, "columns")) {
    const raw = (cmd.patch as Record<string, unknown>).columns;
    const nextCount =
      typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
    setColumnsCount(doc, ctx, node.id, nextCount);
  }

  for (const [key, value] of Object.entries(cmd.patch)) {
    if (PROHIBITED_KEYS.has(key)) continue;
    if (node.type === "columns" && key === "columns") continue;
    (node.props as Record<string, unknown>)[key] = value;
  }
}

function applyUpdateStyle(
  doc: DraftDoc,
  ctx: ApplyCtx,
  cmd: Extract<DocCommand, { type: "UPDATE_STYLE" }>,
) {
  const node = doc.nodes[cmd.nodeId];
  if (!node) {
    pushIssue(ctx, { nodeId: cmd.nodeId, level: "error", message: "Node does not exist." });
    return;
  }
  if (isLocked(node)) {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "This node is locked." });
    return;
  }
  if (!cmd.patch || typeof cmd.patch !== "object") {
    pushIssue(ctx, { nodeId: node.id, level: "error", message: "Style patch must be an object." });
    return;
  }

  if (!node.style) node.style = { base: {} };

  const bp = cmd.breakpoint;
  const target =
    bp === "base"
      ? node.style.base
      : ((node.style[bp] ?? (node.style[bp] = {})) as NonNullable<typeof node.style>[typeof bp]);

  for (const key of STYLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(cmd.patch, key)) continue;
    const value = cmd.patch[key];
    if (value === undefined) {
      delete (target as Record<string, unknown>)[key];
    } else {
      (target as Record<string, unknown>)[key] = value as unknown;
    }
  }

  if (bp !== "base" && Object.keys(target as Record<string, unknown>).length === 0) {
    delete (node.style as Record<string, unknown>)[bp];
  }
}

export function applyDocCommandToDraft(doc: DraftDoc, cmd: DocCommand, ctx: ApplyCtx): void {
  switch (cmd.type) {
    case "ADD_NODE":
      applyAddNode(doc, ctx, cmd);
      return;
    case "INSERT_SUBTREE":
      applyInsertSubtree(doc, ctx, cmd);
      return;
    case "MOVE_NODE":
      applyMoveNode(doc, ctx, cmd);
      return;
    case "DELETE_NODE":
      applyDeleteNode(doc, ctx, cmd);
      return;
    case "DUPLICATE_NODE":
      applyDuplicateNode(doc, ctx, cmd);
      return;
    case "UPDATE_PROPS":
      applyUpdateProps(doc, ctx, cmd);
      return;
    case "UPDATE_STYLE":
      applyUpdateStyle(doc, ctx, cmd);
      return;
    case "SET_COLUMNS":
      setColumnsCount(doc, ctx, cmd.nodeId, cmd.columns);
      return;
    default: {
      const _exhaustive: never = cmd;
      return _exhaustive;
    }
  }
}

export function applyCommand(doc: Document, cmd: DocCommand, opts?: { idFactory?: IdFactory }): ApplyDocCommandResult {
  enablePatches();
  const idFactory = opts?.idFactory ?? createNanoidFactory();
  const issues: ValidationIssue[] = [];
  const ctx: ApplyCtx = { idFactory, issues };

  const [next, patches] = produceWithPatches(doc, (draft) => {
    applyDocCommandToDraft(draft, cmd, ctx);
  });
  const changed = patches.length > 0;
  const validation = validateDocument(next);
  const merged = dedupeIssues([...issues, ...validation]);

  return {
    doc: next,
    issues: merged,
    changed,
    createdNodeId: ctx.createdNodeId,
    deletedNodeIds: ctx.deletedNodeIds,
  };
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.nodeId}|${issue.level}|${issue.fieldPath ?? ""}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export function computeNextSelectionAfterDelete(doc: Document, nodeId: NodeId): NodeId {
  const node = getNode(doc, nodeId);
  if (!node) return doc.rootId;
  const parent = node.parentId ? getNode(doc, node.parentId) : undefined;
  if (!parent) return doc.rootId;

  const index = getChildIndex(parent, nodeId);
  if (index >= 0 && index + 1 < parent.children.length) return parent.children[index + 1];
  if (index > 0) return parent.children[index - 1];
  return parent.id;
}

export function findDefaultPasteTarget(doc: Document, selectedId: NodeId | null, subtreeRootType: NodeType): {
  parentId: NodeId;
  index: number;
} | null {
  const rootId = doc.rootId;

  if (!selectedId) {
    return { parentId: rootId, index: doc.nodes[rootId]?.children.length ?? 0 };
  }

  const selected = doc.nodes[selectedId];
  if (!selected) return { parentId: rootId, index: doc.nodes[rootId]?.children.length ?? 0 };

  const selectedDef = blockRegistry[selected.type];
  const canPasteIntoSelected =
    isDroppable(selected) &&
    selected.type !== "columns" &&
    selectedDef.allowedChildren.includes(subtreeRootType) &&
    canHaveMoreChildren(selected);

  if (canPasteIntoSelected) {
    return { parentId: selected.id, index: selected.children.length };
  }

  if (selected.parentId) {
    const parent = doc.nodes[selected.parentId];
    if (!parent) return null;
    const parentDef = blockRegistry[parent.type];
    const canPasteIntoParent =
      isDroppable(parent) &&
      parent.type !== "columns" &&
      parentDef.allowedChildren.includes(subtreeRootType) &&
      canHaveMoreChildren(parent);

    if (canPasteIntoParent) {
      const idx = parent.children.indexOf(selected.id);
      return { parentId: parent.id, index: idx >= 0 ? idx + 1 : parent.children.length };
    }
  }

  return null;
}
