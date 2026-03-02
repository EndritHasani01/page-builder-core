import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";

import type { Document, Node, NodeId, NodeType } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import type { DragPayload } from "@/dnd";
import { canDrop, nodeDragId, parseNodeDragId, parseTreeRowDropId } from "@/dnd";
import { editorStore, useEditorStore } from "@/store";

import { getNodeLabel } from "../pageBuilderUtils";

import styles from "./LayerTree.module.css";

type TreeDropState = {
  targetNodeId: NodeId;
  position: "before" | "after" | "inside";
  valid: boolean;
};

const NODE_TYPE_ABBR: Record<NodeType, string> = {
  page: "Pg",
  section: "Sc",
  columns: "Co",
  column: "Cl",
  container: "[]",
  text: "Tx",
  image: "Im",
  button: "Bt",
  spacer: "Sp",
  divider: "Dv",
};

function isContainerNode(node: Node): boolean {
  return blockRegistry[node.type].allowedChildren.length > 0;
}

function computeTreeDropPosition(
  rowEl: Element,
  pointer: { x: number; y: number },
  node: Node,
): "before" | "after" | "inside" {
  const rect = rowEl.getBoundingClientRect();
  const relY = pointer.y - rect.top;
  const fraction = relY / rect.height;

  if (!isContainerNode(node) || node.constraints?.droppable === false) {
    return fraction < 0.5 ? "before" : "after";
  }

  if (fraction < 0.33) return "before";
  if (fraction > 0.67) return "after";
  return "inside";
}

function computeTreeDropTarget(
  doc: Document,
  targetNodeId: NodeId,
  position: "before" | "after" | "inside",
  dragNodeId: NodeId,
): { parentId: NodeId; index: number } | null {
  const node = doc.nodes[targetNodeId];
  if (!node) return null;

  if (position === "inside") {
    return { parentId: targetNodeId, index: node.children.length };
  }

  const parentId = node.parentId;
  if (!parentId) return null;

  const parent = doc.nodes[parentId];
  if (!parent) return null;

  const nodeIndex = parent.children.indexOf(targetNodeId);
  if (nodeIndex === -1) return null;

  let index = position === "after" ? nodeIndex + 1 : nodeIndex;

  const dragNode = doc.nodes[dragNodeId];
  if (dragNode?.parentId === parentId) {
    const dragIndex = parent.children.indexOf(dragNodeId);
    if (dragIndex !== -1 && dragIndex < index) index -= 1;
  }

  return { parentId, index };
}

function pointerFromActivatorEvent(ev: unknown): { x: number; y: number } | null {
  if (!ev || typeof ev !== "object") return null;
  const anyEv = ev as { clientX?: unknown; clientY?: unknown };
  if (typeof anyEv.clientX !== "number" || typeof anyEv.clientY !== "number") return null;
  return { x: anyEv.clientX, y: anyEv.clientY };
}

function pointerFromTranslatedRect(
  rect: { left: number; top: number; width: number; height: number } | null | undefined,
): { x: number; y: number } | null {
  if (!rect) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function LayerTree(props: { canvasBodyRef: RefObject<HTMLDivElement | null> }) {
  const { canvasBodyRef } = props;
  const doc = useEditorStore((s) => s.doc);
  const selectedId = useEditorStore((s) => s.selectedId);
  const dispatch = useEditorStore((s) => s.dispatch);
  const mode = useEditorStore((s) => s.mode);

  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());
  const [treeDropState, setTreeDropState] = useState<TreeDropState | null>(null);
  const [activeDragNodeId, setActiveDragNodeId] = useState<NodeId | null>(null);

  const treeDropStateRef = useRef<TreeDropState | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const rowRefs = useRef<Map<NodeId, HTMLElement>>(new Map());

  const dndEnabled = mode !== "preview";

  // Scroll selected row into view when selection changes from the canvas
  const prevSelectedRef = useRef<NodeId | null>(null);
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedRef.current) {
      prevSelectedRef.current = selectedId;
      const el = rowRefs.current.get(selectedId);
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  const toggleCollapsed = useCallback((nodeId: NodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const clearTreeDrop = useCallback(() => {
    treeDropStateRef.current = null;
    setTreeDropState(null);
  }, []);

  useDndMonitor({
    onDragStart(event) {
      const nodeId = parseNodeDragId(event.active.id);
      if (!nodeId) return;
      dragStartRef.current = pointerFromActivatorEvent(event.activatorEvent);
      setActiveDragNodeId(nodeId);
    },
    onDragMove(event) {
      const activeNodeId = parseNodeDragId(event.active.id);
      if (!activeNodeId) {
        clearTreeDrop();
        return;
      }
      const targetNodeId = parseTreeRowDropId(event.over?.id);
      if (!targetNodeId) {
        clearTreeDrop();
        return;
      }

      const pointer = dragStartRef.current
        ? { x: dragStartRef.current.x + event.delta.x, y: dragStartRef.current.y + event.delta.y }
        : pointerFromTranslatedRect(event.active.rect.current.translated);
      if (!pointer) {
        clearTreeDrop();
        return;
      }

      const doc_ = editorStore.getState().doc;
      const targetNode = doc_.nodes[targetNodeId];
      if (!targetNode) {
        clearTreeDrop();
        return;
      }

      const rowEl =
        typeof document !== "undefined" ? document.querySelector(`[data-tree-row="${targetNodeId}"]`) : null;
      const position = rowEl ? computeTreeDropPosition(rowEl, pointer, targetNode) : "after";

      const dropTarget = computeTreeDropTarget(doc_, targetNodeId, position, activeNodeId);
      if (!dropTarget) {
        clearTreeDrop();
        return;
      }

      const source: DragPayload = { kind: "node", nodeId: activeNodeId };
      const result = canDrop(doc_, source, dropTarget);

      const newState: TreeDropState = { targetNodeId, position, valid: result.ok };
      treeDropStateRef.current = newState;
      setTreeDropState(newState);
    },
    onDragEnd(event) {
      const activeNodeId = parseNodeDragId(event.active.id);
      const state = treeDropStateRef.current;

      if (activeNodeId && state?.valid) {
        const store = editorStore.getState();
        const dropTarget = computeTreeDropTarget(store.doc, state.targetNodeId, state.position, activeNodeId);
        if (dropTarget) {
          const moving = store.doc.nodes[activeNodeId];
          if (moving) {
            const fromParent = moving.parentId ? store.doc.nodes[moving.parentId] : null;
            const fromIndex = fromParent?.children.indexOf(activeNodeId) ?? -1;
            const isSameParent = moving.parentId === dropTarget.parentId;
            const isNoOp = isSameParent && fromIndex === dropTarget.index;
            if (!isNoOp) {
              store.beginTransaction(`DnD move ${blockRegistry[moving.type].label}`);
              store.dispatch({ type: "MOVE_NODE", nodeId: activeNodeId, parentId: dropTarget.parentId, index: dropTarget.index });
              store.commitTransaction();
            }
          }
        }
      }

      clearTreeDrop();
      setActiveDragNodeId(null);
      dragStartRef.current = null;
    },
    onDragCancel() {
      clearTreeDrop();
      setActiveDragNodeId(null);
      dragStartRef.current = null;
    },
  });

  const onSelect = useCallback(
    (nodeId: NodeId) => dispatch({ type: "SET_SELECTED", nodeId }),
    [dispatch],
  );
  const onHover = useCallback(
    (nodeId: NodeId) => dispatch({ type: "SET_HOVERED", nodeId }),
    [dispatch],
  );
  const onHoverEnd = useCallback(
    () => dispatch({ type: "SET_HOVERED", nodeId: null }),
    [dispatch],
  );

  const onDoubleClick = useCallback(
    (nodeId: NodeId) => {
      dispatch({ type: "SET_SELECTED", nodeId });
      requestAnimationFrame(() => {
        const canvasEl = canvasBodyRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
        if (canvasEl && typeof (canvasEl as HTMLElement).scrollIntoView === "function") { (canvasEl as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      });
    },
    [dispatch, canvasBodyRef],
  );

  return (
    <div className={styles.tree} role="tree" aria-label="Document layers">
      <LayerTreeNode
        nodeId={doc.rootId}
        doc={doc}
        depth={0}
        selectedId={selectedId}
        collapsed={collapsed}
        treeDropState={treeDropState}
        activeDragNodeId={activeDragNodeId}
        dndEnabled={dndEnabled}
        onToggleCollapsed={toggleCollapsed}
        onSelect={onSelect}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onDoubleClick={onDoubleClick}
        rowRefs={rowRefs}
      />
    </div>
  );
}

function LayerTreeNode(props: {
  nodeId: NodeId;
  doc: Document;
  depth: number;
  selectedId: NodeId | null;
  collapsed: Set<NodeId>;
  treeDropState: TreeDropState | null;
  activeDragNodeId: NodeId | null;
  dndEnabled: boolean;
  onToggleCollapsed: (id: NodeId) => void;
  onSelect: (id: NodeId) => void;
  onHover: (id: NodeId) => void;
  onHoverEnd: () => void;
  onDoubleClick: (id: NodeId) => void;
  rowRefs: MutableRefObject<Map<NodeId, HTMLElement>>;
}) {
  const {
    nodeId,
    doc,
    depth,
    selectedId,
    collapsed,
    treeDropState,
    activeDragNodeId,
    dndEnabled,
    onToggleCollapsed,
    onSelect,
    onHover,
    onHoverEnd,
    onDoubleClick,
    rowRefs,
  } = props;

  const node = doc.nodes[nodeId];
  if (!node) return null;

  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(nodeId);
  const isSelected = selectedId === nodeId;
  const isDragging = activeDragNodeId === nodeId;
  const isLocked = Boolean(node.constraints?.locked);
  const isRoot = nodeId === doc.rootId;

  const draggable = useDraggable({
    id: nodeDragId(nodeId),
    disabled: !dndEnabled || isLocked || isRoot,
    data: { kind: "node", nodeId } satisfies DragPayload,
  });

  const droppable = useDroppable({
    id: `tree-row:${nodeId}`,
    disabled: !dndEnabled,
  });

  const isTreeDropTarget = treeDropState?.targetNodeId === nodeId;
  const dropBefore = isTreeDropTarget && treeDropState?.position === "before";
  const dropAfter = isTreeDropTarget && treeDropState?.position === "after";
  const dropInside = isTreeDropTarget && treeDropState?.position === "inside";
  const dropValid = treeDropState?.valid ?? true;

  const setRowRef = useCallback(
    (el: HTMLElement | null) => {
      droppable.setNodeRef(el);
      if (el) rowRefs.current.set(nodeId, el);
      else rowRefs.current.delete(nodeId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId, rowRefs],
  );

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
    >
      <div
        ref={setRowRef}
        className={styles.row}
        data-tree-row={nodeId}
        data-node-id={nodeId}
        data-selected={isSelected ? true : undefined}
        data-dragging={isDragging ? true : undefined}
        data-drop-before={dropBefore && dropValid ? true : undefined}
        data-drop-after={dropAfter && dropValid ? true : undefined}
        data-drop-inside={dropInside && dropValid ? true : undefined}
        data-drop-invalid={isTreeDropTarget && !dropValid ? true : undefined}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => onSelect(nodeId)}
        onDoubleClick={() => onDoubleClick(nodeId)}
        onMouseEnter={() => onHover(nodeId)}
        onMouseLeave={onHoverEnd}
      >
        <button
          type="button"
          className={styles.chevron}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed(nodeId);
          }}
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
          tabIndex={-1}
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? "\u25B6" : "\u25BC"}
        </button>

        <span className={styles.icon} aria-hidden="true">
          {NODE_TYPE_ABBR[node.type]}
        </span>

        <span className={styles.label}>{getNodeLabel(doc, node)}</span>

        {node.constraints?.locked ? (
          <span className={styles.constraint} title="Locked" aria-label="Locked">
            <LockIcon />
          </span>
        ) : null}
        {node.constraints?.hidden ? (
          <span className={styles.constraint} title="Hidden" aria-label="Hidden">
            <HiddenIcon />
          </span>
        ) : null}

        <button
          type="button"
          ref={draggable.setActivatorNodeRef}
          className={styles.dragHandle}
          disabled={!dndEnabled || isLocked || isRoot}
          aria-label={`Drag ${getNodeLabel(doc, node)}`}
          {...draggable.attributes}
          {...draggable.listeners}
        >
          {"\u2807"}
        </button>
      </div>

      {!isCollapsed && hasChildren ? (
        <div>
          {node.children.map((childId) => (
            <LayerTreeNode
              key={childId}
              nodeId={childId}
              doc={doc}
              depth={depth + 1}
              selectedId={selectedId}
              collapsed={collapsed}
              treeDropState={treeDropState}
              activeDragNodeId={activeDragNodeId}
              dndEnabled={dndEnabled}
              onToggleCollapsed={onToggleCollapsed}
              onSelect={onSelect}
              onHover={onHover}
              onHoverEnd={onHoverEnd}
              onDoubleClick={onDoubleClick}
              rowRefs={rowRefs}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <rect x="2" y="4.5" width="6" height="5.5" rx="1" />
      <path
        d="M3.5 4.5V3a1.5 1.5 0 0 1 3 0v1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HiddenIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M1 5c1.3-2.5 6.7-2.5 8 0" />
      <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
    </svg>
  );
}
