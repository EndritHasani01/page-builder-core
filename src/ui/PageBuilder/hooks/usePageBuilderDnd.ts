import type { ComponentProps, RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { Document, NodeId } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import { remapIds } from "@/editor-core/subtree";
import type { DragPayload, DropIntent } from "@/dnd";
import { computeDropIntent, parseComponentDragId, parseContainerDropId, parseNodeDragId, parsePaletteDragId } from "@/dnd";
import { loadComponents } from "@/persistence/componentLibrary";
import { editorStore } from "@/store";

import { buildPaletteSubtree, describeNodeForA11y } from "../pageBuilderUtils";

export type DropInvalidInfo = { overId: NodeId; reason: string };

export type DropIndicatorGeometry = {
  kind: "line" | "placeholder";
  axis: "x" | "y";
  parentId: NodeId;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PageBuilderDndContextProps = Omit<ComponentProps<typeof DndContext>, "children">;

export function usePageBuilderDnd(args: {
  canvasBodyRef: RefObject<HTMLDivElement | null>;
  pushToast: (kind: "info" | "error", message: string) => void;
}): {
  activeDrag: DragPayload | null;
  dropIntent: DropIntent | null;
  dropInvalid: DropInvalidInfo | null;
  dropIndicator: DropIndicatorGeometry | null;
  dragOverlayLabel: string | null;
  cursorPos: { x: number; y: number } | null;
  dndContextProps: PageBuilderDndContextProps;
} {
  const { canvasBodyRef, pushToast } = args;
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [dropInvalid, setDropInvalid] = useState<DropInvalidInfo | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorGeometry | null>(null);
  const [dragOverlayLabel, setDragOverlayLabel] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const activeDragRef = useRef<DragPayload | null>(null);
  const dropIntentRef = useRef<DropIntent | null>(null);
  const dropInvalidRef = useRef<DropInvalidInfo | null>(null);

  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);
  const lastIntentKey = useRef<string | null>(null);

  const clearDndState = useCallback(() => {
    setActiveDrag(null);
    setDropIntent(null);
    setDropInvalid(null);
    setDropIndicator(null);
    setDragOverlayLabel(null);
    setCursorPos(null);
    dragStartPoint.current = null;
    lastIntentKey.current = null;
    activeDragRef.current = null;
    dropIntentRef.current = null;
    dropInvalidRef.current = null;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection = useCallback<NonNullable<ComponentProps<typeof DndContext>["collisionDetection"]>>((args) => {
    const pointerHits = pointerWithin(args);
    return pointerHits.length > 0 ? pointerHits : closestCenter(args);
  }, []);

  const lastDndAnnouncement = useRef<string | null>(null);

  const dndAnnouncements = useMemo(() => {
    const maybeAnnounce = (msg: string | undefined) => {
      if (!msg) return undefined;
      if (lastDndAnnouncement.current === msg) return undefined;
      lastDndAnnouncement.current = msg;
      return msg;
    };

    const describeActive = (activeId: unknown): string => {
      const paletteType = parsePaletteDragId(activeId);
      if (paletteType) return `${blockRegistry[paletteType].label} block`;

      const nodeId = parseNodeDragId(activeId);
      if (nodeId) {
        const node = editorStore.getState().doc.nodes[nodeId];
        if (node) return `${blockRegistry[node.type].label} block`;
      }

      const componentId = parseComponentDragId(activeId);
      if (componentId) {
        const comp = loadComponents().find((c) => c.id === componentId);
        if (comp) return `${comp.name} component`;
      }

      return "block";
    };

    const describeIntent = (intent: DropIntent): string => {
      const d = editorStore.getState().doc;
      const container = describeNodeForA11y(d, intent.parentId);
      return `${container}, position ${intent.index + 1}`;
    };

    const announceCurrentTarget = () => {
      const invalid = dropInvalidRef.current;
      if (invalid) {
        return maybeAnnounce(`Cannot drop here. ${invalid.reason}`);
      }

      const intent = dropIntentRef.current;
      if (!intent) return undefined;
      return maybeAnnounce(`Moving to ${describeIntent(intent)}.`);
    };

    return {
      onDragStart({ active }) {
        lastDndAnnouncement.current = null;
        return maybeAnnounce(`Picked up ${describeActive(active.id)}.`);
      },
      onDragMove() {
        return announceCurrentTarget();
      },
      onDragOver() {
        return announceCurrentTarget();
      },
      onDragEnd({ active }) {
        const intent = dropIntentRef.current;
        if (intent) {
          return maybeAnnounce(`Dropped ${describeActive(active.id)} into ${describeIntent(intent)}.`);
        }

        const invalid = dropInvalidRef.current;
        if (invalid) {
          return maybeAnnounce(`Drop cancelled. ${invalid.reason}`);
        }

        return maybeAnnounce(`Drop cancelled for ${describeActive(active.id)}.`);
      },
      onDragCancel({ active }) {
        const msg = `Cancelled dragging ${describeActive(active.id)}.`;
        lastDndAnnouncement.current = null;
        return maybeAnnounce(msg);
      },
    } satisfies Announcements;
  }, []);

  const dndScreenReaderInstructions = useMemo(
    () => ({
      draggable:
        "To pick up a block, press space. While dragging, use the arrow keys to move. Press space again to drop, or Escape to cancel.",
    }),
    [],
  );

  const computeDropFromEvent = useCallback(
    (payload: DragPayload, event: DragMoveEvent | DragEndEvent): { intent: DropIntent | null; invalid: DropInvalidInfo | null } => {
      const start = dragStartPoint.current;
      const pointer = start
        ? { x: start.x + event.delta.x, y: start.y + event.delta.y }
        : pointerFromTranslatedRect(event.active.rect.current.translated);

      if (!pointer) return { intent: null, invalid: null };

      const state = editorStore.getState();
      const overContainerId = parseContainerDropId(event.over?.id);
      const res = computeDropIntent({ doc: state.doc, breakpoint: state.breakpoint, source: payload, overContainerId, pointer });
      if (res.ok) return { intent: res.intent, invalid: null };
      if (res.overId) return { intent: null, invalid: { overId: res.overId, reason: res.reason } };
      return { intent: null, invalid: null };
    },
    [],
  );

  const updateDropFromEvent = useCallback(
    (payload: DragPayload, event: DragMoveEvent | DragEndEvent) => {
      // Track cursor position for the DragTooltip
      const start = dragStartPoint.current;
      if (start) {
        setCursorPos({ x: start.x + event.delta.x, y: start.y + event.delta.y });
      } else {
        const rect = event.active.rect.current.translated;
        if (rect) setCursorPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }

      const next = computeDropFromEvent(payload, event);
      if (next.intent) {
        const key = `${next.intent.parentId}|${next.intent.index}`;
        if (key !== lastIntentKey.current) {
          lastIntentKey.current = key;
          setDropIntent(next.intent);
        }
        dropIntentRef.current = next.intent;

        const hadInvalid = dropInvalidRef.current !== null;
        dropInvalidRef.current = null;
        if (hadInvalid) setDropInvalid(null);

        const canvasEl = canvasBodyRef.current;
        const doc = editorStore.getState().doc;
        const geom = canvasEl ? computeDropIndicatorGeometry(doc, next.intent, canvasEl) : null;
        setDropIndicator((prev) => (isSameDropIndicator(prev, geom) ? prev : geom));
        return;
      }

      lastIntentKey.current = null;
      if (dropIntentRef.current !== null) setDropIntent(null);
      dropIntentRef.current = null;

      if (next.invalid) {
        dropInvalidRef.current = next.invalid;
        setDropInvalid((prev) => {
          if (prev && prev.overId === next.invalid!.overId && prev.reason === next.invalid!.reason) return prev;
          return next.invalid;
        });
      } else if (dropInvalidRef.current !== null) {
        dropInvalidRef.current = null;
        setDropInvalid(null);
      }

      setDropIndicator(null);
    },
    [canvasBodyRef, computeDropFromEvent],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const state = editorStore.getState();
      const dndEnabled = state.mode !== "preview" && !state.activeTxn;
      if (!dndEnabled) return;

      const nodeId = parseNodeDragId(event.active.id);
      const paletteType = parsePaletteDragId(event.active.id);
      const componentId = parseComponentDragId(event.active.id);
      const payload: DragPayload | null =
        nodeId ? { kind: "node", nodeId }
        : paletteType ? { kind: "palette", nodeType: paletteType }
        : componentId ? { kind: "component", componentId }
        : null;
      if (!payload) return;

      dragStartPoint.current = pointerFromActivatorEvent(event.activatorEvent);
      lastIntentKey.current = null;
      setActiveDrag(payload);
      activeDragRef.current = payload;
      setDropIntent(null);
      setDropInvalid(null);
      setDropIndicator(null);
      dropIntentRef.current = null;
      dropInvalidRef.current = null;

      if (payload.kind === "palette") {
        setDragOverlayLabel(`Add ${blockRegistry[payload.nodeType].label}`);
      } else if (payload.kind === "component") {
        const comps = loadComponents();
        const comp = comps.find((c) => c.id === payload.componentId);
        setDragOverlayLabel(comp ? `Add ${comp.name}` : "Add component");
      } else {
        const node = state.doc.nodes[payload.nodeId];
        setDragOverlayLabel(node ? `Move ${blockRegistry[node.type].label}` : "Move");
        state.dispatch({ type: "SET_SELECTED", nodeId: payload.nodeId });
      }
    },
    [],
  );

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      const state = editorStore.getState();
      const dndEnabled = state.mode !== "preview" && !state.activeTxn;
      if (!dndEnabled) return;
      const payload = activeDragRef.current;
      if (!payload) return;
      updateDropFromEvent(payload, event);
    },
    [updateDropFromEvent],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const payload = activeDragRef.current;
      if (!payload) return;

      const state = editorStore.getState();
      const dndEnabled = state.mode !== "preview" && !state.activeTxn;

      const computed = dndEnabled ? computeDropFromEvent(payload, event) : { intent: null, invalid: null };

      if (!dndEnabled) {
        clearDndState();
        return;
      }

      if (!computed.intent) {
        if (computed.invalid) pushToast("error", computed.invalid.reason);
        clearDndState();
        return;
      }

      const intent = computed.intent;

      if (payload.kind === "palette") {
        const subtree = buildPaletteSubtree(payload.nodeType, state.idFactory);
        state.beginTransaction(`DnD add ${blockRegistry[payload.nodeType].label}`);
        state.dispatch({ type: "INSERT_SUBTREE", parentId: intent.parentId, index: intent.index, subtree });
        state.commitTransaction();
      } else if (payload.kind === "component") {
        const comps = loadComponents();
        const comp = comps.find((c) => c.id === payload.componentId);
        if (!comp) {
          pushToast("error", "Component not found in library.");
          clearDndState();
          return;
        }
        const remapped = remapIds(comp.subtree, state.idFactory);
        state.beginTransaction(`DnD add ${comp.name}`);
        state.dispatch({ type: "INSERT_SUBTREE", parentId: intent.parentId, index: intent.index, subtree: remapped });
        state.commitTransaction();
      } else {
        const moving = state.doc.nodes[payload.nodeId];
        const fromParentId = moving?.parentId ?? null;
        if (!moving || !fromParentId) {
          pushToast("error", "Dragged node no longer exists.");
          clearDndState();
          return;
        }

        const fromParent = state.doc.nodes[fromParentId];
        const fromIndex = fromParent ? fromParent.children.indexOf(moving.id) : -1;
        const isSameParent = fromParentId === intent.parentId;
        const isNoOp = isSameParent && fromIndex === intent.index;

        if (!isNoOp) {
          state.beginTransaction(`DnD move ${blockRegistry[moving.type].label}`);
          state.dispatch({ type: "MOVE_NODE", nodeId: moving.id, parentId: intent.parentId, index: intent.index });
          state.commitTransaction();
        }
      }

      state.dispatch({ type: "SET_HOVERED", nodeId: null });
      clearDndState();
    },
    [clearDndState, computeDropFromEvent, pushToast],
  );

  const onDragCancel = useCallback(() => {
    clearDndState();
  }, [clearDndState]);

  const dndContextProps: PageBuilderDndContextProps = useMemo(
    () => ({
      accessibility: { announcements: dndAnnouncements, screenReaderInstructions: dndScreenReaderInstructions },
      sensors,
      collisionDetection,
      onDragStart,
      onDragMove,
      onDragEnd,
      onDragCancel,
      autoScroll: true,
    }),
    [
      collisionDetection,
      dndAnnouncements,
      dndScreenReaderInstructions,
      onDragCancel,
      onDragEnd,
      onDragMove,
      onDragStart,
      sensors,
    ],
  );

  return { activeDrag, dropIntent, dropInvalid, dropIndicator, dragOverlayLabel, cursorPos, dndContextProps };
}

function isSameDropIndicator(a: DropIndicatorGeometry | null, b: DropIndicatorGeometry | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.axis === b.axis &&
    a.parentId === b.parentId &&
    a.index === b.index &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function computeDropIndicatorGeometry(doc: Document, intent: DropIntent, canvasBodyEl: HTMLElement): DropIndicatorGeometry | null {
  if (typeof document === "undefined") return null;

  const canvasRect = canvasBodyEl.getBoundingClientRect();
  const containerEl = canvasBodyEl.querySelector(`[data-node-id="${intent.parentId}"]`);
  if (!(containerEl instanceof HTMLElement)) return null;

  const containerRect = containerEl.getBoundingClientRect();
  const children = doc.nodes[intent.parentId]?.children ?? [];

  const inset = 8;
  if (children.length === 0) {
    return {
      kind: "placeholder",
      axis: intent.axis,
      parentId: intent.parentId,
      index: intent.index,
      left: Math.round(containerRect.left - canvasRect.left + inset),
      top: Math.round(containerRect.top - canvasRect.top + inset),
      width: Math.round(Math.max(0, containerRect.width - inset * 2)),
      height: Math.round(Math.max(32, containerRect.height - inset * 2)),
    };
  }

  if (intent.axis === "x") {
    const beforeId = intent.index < children.length ? children[intent.index] : null;
    const refId = beforeId ?? children[children.length - 1];
    const refEl = canvasBodyEl.querySelector(`[data-node-id="${refId}"]`);

    let x = containerRect.left;
    if (refEl instanceof HTMLElement) {
      const r = refEl.getBoundingClientRect();
      x = beforeId ? r.left : r.right;
    }

    return {
      kind: "line",
      axis: "x",
      parentId: intent.parentId,
      index: intent.index,
      left: Math.round(x - canvasRect.left),
      top: Math.round(containerRect.top - canvasRect.top + inset),
      width: 2,
      height: Math.round(Math.max(0, containerRect.height - inset * 2)),
    };
  }

  const beforeId = intent.index < children.length ? children[intent.index] : null;
  const refId = beforeId ?? children[children.length - 1];
  const refEl = canvasBodyEl.querySelector(`[data-node-id="${refId}"]`);

  let y = containerRect.top;
  if (refEl instanceof HTMLElement) {
    const r = refEl.getBoundingClientRect();
    y = beforeId ? r.top : r.bottom;
  }

  return {
    kind: "line",
    axis: "y",
    parentId: intent.parentId,
    index: intent.index,
    left: Math.round(containerRect.left - canvasRect.left + inset),
    top: Math.round(y - canvasRect.top),
    width: Math.round(Math.max(0, containerRect.width - inset * 2)),
    height: 2,
  };
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
