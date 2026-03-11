import type { MouseEvent, RefObject } from "react";
import { useCallback, useId, useMemo, useState } from "react";

import type { NodeId, RichContent } from "@/editor-core";
import { RenderDocument } from "@/renderer";
import { useEditorStore } from "@/store";

import type { DragPayload, DropIntent } from "@/dnd";
import type { DropIndicatorGeometry, DropInvalidInfo } from "../hooks/usePageBuilderDnd";
import { useBlockContextMenu } from "../hooks/useBlockContextMenu";
import { buildSelectionBreadcrumb } from "../pageBuilderUtils";
import { ContextMenu } from "./ContextMenu";
import { DragTooltip } from "./DragTooltip";
import { EmptyCanvas } from "./EmptyCanvas";
import { HoverActions } from "./HoverActions";

import styles from "../PageBuilder.module.css";

export function PageBuilderCanvas(props: {
  canvasFrameRef: RefObject<HTMLDivElement | null>;
  canvasBodyRef: RefObject<HTMLDivElement | null>;
  focusCanvasFrame: () => void;
  activeDrag: DragPayload | null;
  dropIntent: DropIntent | null;
  dropInvalid: DropInvalidInfo | null;
  dropIndicator: DropIndicatorGeometry | null;
  onAddSection: () => void;
  onBrowseTemplates?: () => void;
  onPreviewFormSubmit?: () => void;
  onSaveToLibrary?: (nodeId: NodeId) => void;
  pushToast: (kind: "info" | "error", message: string) => void;
}) {
  const {
    canvasFrameRef,
    canvasBodyRef,
    focusCanvasFrame,
    activeDrag,
    dropIntent,
    dropInvalid,
    dropIndicator,
    onAddSection,
    onBrowseTemplates,
    onPreviewFormSubmit,
    onSaveToLibrary,
    pushToast,
  } = props;
  const doc = useEditorStore((s) => s.doc);
  const mode = useEditorStore((s) => s.mode);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const hoveredId = useEditorStore((s) => s.hoveredId);
  const activeTxn = useEditorStore((s) => s.activeTxn);
  const dispatch = useEditorStore((s) => s.dispatch);

  const selectionDescId = useId();

  const isPreview = mode === "preview";
  const renderMode = isPreview ? "preview" : "editor";
  const selectionBreadcrumb = useMemo(() => buildSelectionBreadcrumb(doc, selectedId), [doc, selectedId]);

  const [inlineTextEditingId, setInlineTextEditingId] = useState<NodeId | null>(null);

  const {
    menu: contextMenu,
    closeMenu,
    onNodeContextMenu,
    onCanvasContextMenu,
    buildBlockMenuItems,
    buildCanvasMenuItems,
  } = useBlockContextMenu({ pushToast, onAddSection, onBrowseTemplates, onSaveToLibrary });

  const onSelect = useCallback(
    (nodeId: NodeId, shift?: boolean) => {
      if (shift) {
        dispatch({ type: "SHIFT_SELECT", nodeId });
      } else {
        dispatch({ type: "SET_SELECTED", nodeId });
      }
    },
    [dispatch],
  );

  const onHover = useCallback(
    (nodeId: NodeId | null) => {
      dispatch({ type: "SET_HOVERED", nodeId });
    },
    [dispatch],
  );

  const onCanvasClick = useCallback(
    (e: MouseEvent) => {
      if (isPreview) return;
      if (e.target !== e.currentTarget) return;
      dispatch({ type: "SET_SELECTED", nodeId: doc.rootId });
      dispatch({ type: "SET_HOVERED", nodeId: null });
      focusCanvasFrame();
    },
    [dispatch, doc.rootId, focusCanvasFrame, isPreview],
  );

  const dndEnabled = !isPreview && !activeTxn;

  const onStartInlineTextEdit = useCallback(
    (nodeId: NodeId) => {
      if (isPreview) return;
      dispatch({ type: "SET_SELECTED", nodeId });
      setInlineTextEditingId(nodeId);
    },
    [dispatch, isPreview],
  );

  const onCommitInlineTextEdit = useCallback(
    (nodeId: NodeId, nextContent: RichContent) => {
      if (isPreview) return;
      setInlineTextEditingId(null);
      dispatch(
        { type: "UPDATE_PROPS", nodeId, patch: { content: nextContent } },
        { historyLabel: "Edit", coalesceKey: `props:${nodeId}:content:inline` },
      );
      focusCanvasFrame();
    },
    [dispatch, focusCanvasFrame, isPreview],
  );

  const onCancelInlineTextEdit = useCallback(
    () => {
      setInlineTextEditingId(null);
      focusCanvasFrame();
    },
    [focusCanvasFrame],
  );

  // Show the empty canvas state when the page root has no children and we're in edit mode.
  const rootNode = doc.nodes[doc.rootId];
  const isEmpty = !isPreview && rootNode != null && rootNode.children.length === 0;

  return (
    <section className={styles.canvas} aria-label="Canvas" data-tour="canvas">
      <div
        ref={canvasFrameRef}
        className={styles.canvasFrame}
        data-mode={mode}
        data-bp={breakpoint}
        tabIndex={0}
        aria-label="Canvas editor"
        aria-describedby={selectionDescId}
        onMouseLeave={() => dispatch({ type: "SET_HOVERED", nodeId: null })}
      >
        <div className={styles.canvasTitle}>Canvas ({mode})</div>
        <div id={selectionDescId} className={styles.selectionBreadcrumb} aria-live="polite">
          {selectedIds.length > 1
            ? `${selectedIds.length} selected`
            : selectionBreadcrumb}
        </div>
        {dropInvalid ? (
          <div className={styles.dropInvalidMessage} role="status" aria-label="Invalid drop target">
            {dropInvalid.reason}
          </div>
        ) : null}
        <div
          ref={canvasBodyRef}
          className={styles.canvasBody}
          onClick={onCanvasClick}
          onContextMenu={!isPreview ? (e) => onCanvasContextMenu(e.nativeEvent) : undefined}
        >
          {isEmpty ? (
            <EmptyCanvas onAddSection={onAddSection} onBrowseTemplates={onBrowseTemplates} />
          ) : (
            <RenderDocument
              doc={doc}
              mode={renderMode}
              breakpoint={breakpoint}
              disableNavigation={isPreview}
              selectedId={renderMode === "editor" ? selectedId : null}
              selectedIds={renderMode === "editor" ? selectedIds : null}
              hoveredId={renderMode === "editor" ? hoveredId : null}
              enableDnd={renderMode === "editor" ? dndEnabled : false}
              draggingId={activeDrag?.kind === "node" ? activeDrag.nodeId : null}
              dropTargetId={dropIntent?.parentId ?? null}
              dropInvalidId={dropInvalid?.overId ?? null}
              dropSlotIntent={
                renderMode === "editor" && dropIndicator
                  ? { parentId: dropIndicator.parentId, index: dropIndicator.index, axis: dropIndicator.axis }
                  : null
              }
              inlineTextEditingId={renderMode === "editor" ? inlineTextEditingId : null}
              onStartInlineTextEdit={renderMode === "editor" ? onStartInlineTextEdit : undefined}
              onCommitInlineTextEdit={renderMode === "editor" ? onCommitInlineTextEdit : undefined}
              onCancelInlineTextEdit={renderMode === "editor" ? onCancelInlineTextEdit : undefined}
              onSelect={renderMode === "editor" ? onSelect : undefined}
              onHover={renderMode === "editor" ? onHover : undefined}
              onPreviewFormSubmit={isPreview ? onPreviewFormSubmit : undefined}
              onNodeContextMenu={
                renderMode === "editor"
                  ? (nodeId, e) => onNodeContextMenu(nodeId, e.nativeEvent)
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Hover quick-action toolbar — shown when hovering a non-root node in edit mode */}
      {renderMode === "editor" && hoveredId && hoveredId !== doc.rootId && !activeDrag && !inlineTextEditingId ? (
        <HoverActions
          hoveredId={hoveredId}
          onDuplicate={(id) => {
            dispatch({ type: "DUPLICATE_NODE", nodeId: id }, { historyLabel: "Duplicate" });
          }}
          onDelete={(id) => {
            if (id === doc.rootId) return;
            dispatch({ type: "DELETE_NODE", nodeId: id }, { historyLabel: "Delete" });
          }}
        />
      ) : null}

      {/* Context menu — shown on right-click */}
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.kind === "block"
              ? buildBlockMenuItems(contextMenu.nodeId)
              : buildCanvasMenuItems()
          }
          onClose={closeMenu}
        />
      ) : null}

      {/* Cursor-following tooltip for invalid drag targets */}
      {activeDrag ? <DragTooltip reason={dropInvalid?.reason ?? null} /> : null}
    </section>
  );
}
