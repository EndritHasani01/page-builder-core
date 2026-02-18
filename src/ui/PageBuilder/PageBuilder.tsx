import type { CSSProperties, ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { Breakpoint, Document, IdFactory, NodeId, NodeType, StyleProps, Subtree, ValidationIssue } from "@/editor-core";
import {
  COLOR_TOKENS,
  FONT_FAMILY_TOKENS,
  FONT_SIZE_TOKENS,
  blockRegistry,
  cloneSubtree,
  createDefaultDocument,
  createNode,
  getEffectiveStyleValue,
  getInheritedStyleValue,
  getSpacingTokens,
  isStyleKeyOverridden,
  remapIds,
  validateDocument,
} from "@/editor-core";
import type { DragPayload, DropIntent } from "@/dnd";
import { computeDropIntent, paletteDragId, parseContainerDropId, parseNodeDragId, parsePaletteDragId } from "@/dnd";
import { RenderDocument, themeToCssVars } from "@/renderer";
import { collectHtmlExportWarnings, exportDocumentToHtml, exportDocumentToJson } from "@/export";
import type { DispatchOptions, EditorAction, Mode } from "@/store";
import { editorStore, useEditorStore } from "@/store";
import type { AutosaveController, ParseDocumentErrorCode, PersistenceStatus, WorkspaceDocMeta } from "@/persistence";
import {
  clearLocalStorage,
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  duplicateWorkspaceDocument,
  getActiveWorkspaceDocId,
  listWorkspaceDocuments,
  loadBackupFromLocalStorage,
  loadWorkspaceDocument,
  parseDocumentJsonText,
  saveWorkspaceDocument,
  setActiveWorkspaceDocId,
  startAutosave,
} from "@/persistence";
import { getShortcutAction, isEditableTarget } from "@/ui/keyboard/shortcuts";

import styles from "./PageBuilder.module.css";

type RecoveryInfo = {
  code: ParseDocumentErrorCode;
  error: string;
  rawPrimary?: string;
  rawBackup?: string;
};

export function PageBuilder() {
  const doc = useEditorStore((s) => s.doc);
  const issues = useEditorStore((s) => s.issues);
  const mode = useEditorStore((s) => s.mode);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const selectedId = useEditorStore((s) => s.selectedId);
  const hoveredId = useEditorStore((s) => s.hoveredId);
  const idFactory = useEditorStore((s) => s.idFactory);
  const undoStackLen = useEditorStore((s) => s.undoStack.length);
  const redoStackLen = useEditorStore((s) => s.redoStack.length);
  const activeTxn = useEditorStore((s) => s.activeTxn);

  const dispatch = useEditorStore((s) => s.dispatch);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const copySelected = useEditorStore((s) => s.copySelected);
  const cutSelected = useEditorStore((s) => s.cutSelected);
  const paste = useEditorStore((s) => s.paste);
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const commitTransaction = useEditorStore((s) => s.commitTransaction);
  const replaceDocument = useEditorStore((s) => s.replaceDocument);

  const [inspectorTab, setInspectorTab] = useState<"content" | "style">("content");
  const [dialog, setDialog] = useState<null | "import" | "export" | "shortcuts">(null);
  const [mobilePanel, setMobilePanel] = useState<null | "palette" | "inspector">(null);
  const [persistence, setPersistence] = useState<PersistenceStatus>({ state: "idle" });
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const autosaveRef = useRef<AutosaveController | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [dropInvalid, setDropInvalid] = useState<null | { overId: NodeId; reason: string }>(null);
  const [dropIndicator, setDropIndicator] = useState<null | DropIndicatorGeometry>(null);
  const dragStartPoint = useRef<{ x: number; y: number } | null>(null);
  const lastIntentKey = useRef<string | null>(null);
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasBodyRef = useRef<HTMLDivElement | null>(null);

  const [toasts, setToasts] = useState<Array<{ id: string; kind: "info" | "error"; message: string }>>([]);
  const toastTimers = useRef(new Map<string, number>());

  const pushToast = useCallback((kind: "info" | "error", message: string) => {
    const id = `t_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, 4500);
    toastTimers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [workspaceDocs, setWorkspaceDocs] = useState<WorkspaceDocMeta[]>(() => listWorkspaceDocuments());
  const [docId, setDocId] = useState<string>(() => {
    const active = getActiveWorkspaceDocId();
    if (active) return active;
    const docs = listWorkspaceDocuments();
    if (docs.length > 0) return docs[0]!.id;
    return "default";
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const refreshWorkspaceDocs = useCallback(() => {
    setWorkspaceDocs(listWorkspaceDocuments());
  }, []);

  const isNarrow = useMediaQuery("(max-width: 1024px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const selectionDescId = useId();

  const latestRef = useRef({
    doc,
    selectedId,
    mode,
    dialog,
    mobilePanel,
    resetOpen,
    recoveryOpen,
    activeDrag,
    dropIntent,
    dropInvalid,
    activeTxn,
  });

  useLayoutEffect(() => {
    latestRef.current = {
      doc,
      selectedId,
      mode,
      dialog,
      mobilePanel,
      resetOpen,
      recoveryOpen,
      activeDrag,
      dropIntent,
      dropInvalid,
      activeTxn,
    };
  }, [activeDrag, activeTxn, dialog, doc, dropIntent, dropInvalid, mobilePanel, mode, recoveryOpen, resetOpen, selectedId]);

  const focusCanvasFrame = useCallback(() => {
    const el = canvasFrameRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const action = getShortcutAction(e);
      if (!action) return;

      if (latestRef.current.activeDrag) return;

      const isDialogOpen =
        latestRef.current.dialog !== null ||
        latestRef.current.mobilePanel !== null ||
        latestRef.current.resetOpen ||
        latestRef.current.recoveryOpen;

      if (action !== "ESCAPE" && isEditableTarget(e.target)) return;
      if (isDialogOpen && action !== "ESCAPE") return;

      const modeNow = latestRef.current.mode;
      if (modeNow === "preview" && action !== "ESCAPE" && action !== "TOGGLE_MODE") return;

      if (latestRef.current.activeTxn && action !== "ESCAPE") return;

      switch (action) {
        case "ESCAPE": {
          if (isDialogOpen) {
            e.preventDefault();
            if (latestRef.current.dialog !== null) setDialog(null);
            else if (latestRef.current.resetOpen) setResetOpen(false);
            else if (latestRef.current.recoveryOpen) setRecoveryOpen(false);
            else if (latestRef.current.mobilePanel !== null) setMobilePanel(null);
            return;
          }

          e.preventDefault();
          const d = latestRef.current.doc;
          dispatch({ type: "SET_SELECTED", nodeId: d.rootId });
          dispatch({ type: "SET_HOVERED", nodeId: null });
          focusCanvasFrame();
          return;
        }

        case "TOGGLE_MODE": {
          e.preventDefault();
          dispatch({ type: "SET_MODE", mode: modeNow === "edit" ? "preview" : "edit" });
          focusCanvasFrame();
          return;
        }

        case "UNDO": {
          e.preventDefault();
          undo();
          focusCanvasFrame();
          return;
        }

        case "REDO": {
          e.preventDefault();
          redo();
          focusCanvasFrame();
          return;
        }

        case "COPY": {
          e.preventDefault();
          const res = copySelected();
          if (!res.ok) pushToast("error", res.error);
          return;
        }

        case "CUT": {
          e.preventDefault();
          const res = cutSelected();
          if (!res.ok) {
            pushToast("error", res.error);
            return;
          }
          focusCanvasFrame();
          return;
        }

        case "PASTE": {
          e.preventDefault();
          const res = paste();
          if (!res.ok) {
            pushToast("error", res.error);
            return;
          }
          focusCanvasFrame();
          return;
        }

        case "DELETE_SELECTED": {
          e.preventDefault();
          const d = latestRef.current.doc;
          const id = latestRef.current.selectedId;
          if (!id || id === d.rootId) {
            pushToast("error", "Cannot delete the root Page node.");
            return;
          }
          dispatch({ type: "DELETE_NODE", nodeId: id }, { historyLabel: "Delete" });
          focusCanvasFrame();
          return;
        }

        case "DUPLICATE_SELECTED": {
          e.preventDefault();
          const d = latestRef.current.doc;
          const id = latestRef.current.selectedId;
          if (!id || id === d.rootId) {
            pushToast("error", "Cannot duplicate the root Page node.");
            return;
          }
          dispatch({ type: "DUPLICATE_NODE", nodeId: id }, { historyLabel: "Duplicate" });
          focusCanvasFrame();
          return;
        }

        case "MOVE_UP":
        case "MOVE_DOWN": {
          e.preventDefault();
          const d = latestRef.current.doc;
          const id = latestRef.current.selectedId;
          if (!id || id === d.rootId) return;
          const node = d.nodes[id];
          const parentId = node?.parentId;
          if (!node || !parentId) return;
          const parent = d.nodes[parentId];
          const from = parent?.children.indexOf(id) ?? -1;
          if (!parent || from < 0) return;

          const delta = action === "MOVE_UP" ? -1 : 1;
          const to = from + delta;
          if (to < 0 || to >= parent.children.length) return;

          dispatch({ type: "MOVE_NODE", nodeId: id, parentId, index: to }, { historyLabel: "Reorder" });
          focusCanvasFrame();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [copySelected, cutSelected, dispatch, focusCanvasFrame, paste, pushToast, redo, undo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection = useCallback<typeof pointerWithin>((args) => {
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
        const node = latestRef.current.doc.nodes[nodeId];
        if (node) return `${blockRegistry[node.type].label} block`;
      }

      return "block";
    };

    const describeIntent = (intent: DropIntent): string => {
      const d = latestRef.current.doc;
      const container = describeNodeForA11y(d, intent.parentId);
      return `${container}, position ${intent.index + 1}`;
    };

    const announceCurrentTarget = () => {
      const invalid = latestRef.current.dropInvalid;
      if (invalid) {
        return maybeAnnounce(`Cannot drop here. ${invalid.reason}`);
      }

      const intent = latestRef.current.dropIntent;
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
        const intent = latestRef.current.dropIntent;
        if (intent) {
          return maybeAnnounce(`Dropped ${describeActive(active.id)} into ${describeIntent(intent)}.`);
        }

        const invalid = latestRef.current.dropInvalid;
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

  const stopAutosaveController = useCallback(() => {
    const ctrl = autosaveRef.current;
    if (ctrl) ctrl.stop();
    autosaveRef.current = null;
  }, []);

  const activateLoadedDocument = useCallback(
    (nextDocId: string, nextDoc: Document) => {
      stopAutosaveController();
      replaceDocument(nextDoc);
      setDocId(nextDocId);
      setActiveWorkspaceDocId(nextDocId);
      setRecovery(null);
      setRecoveryOpen(false);
      setAutosaveEnabled(true);
      setPersistence({ state: "saved", at: Date.now() });
      refreshWorkspaceDocs();
    },
    [refreshWorkspaceDocs, replaceDocument, stopAutosaveController],
  );

  const activateDocId = useCallback(
    (nextDocId: string) => {
      const trimmed = nextDocId.trim();
      if (!trimmed) return;

      stopAutosaveController();

      const loaded = loadWorkspaceDocument(trimmed);
      if (!loaded.ok) {
        if (loaded.code === "NOT_FOUND") {
          const created = createWorkspaceDocument({ docId: trimmed });
          if (!created.ok) {
            setPersistence({ state: "error", error: created.error, quota: created.quota });
            pushToast("error", created.error);
            return;
          }

          activateLoadedDocument(created.docId, created.doc);
          pushToast("info", "Created a new document.");
          return;
        }

        const info: RecoveryInfo = {
          code: loaded.code,
          error: loaded.error,
          rawPrimary: loaded.rawPrimary,
          rawBackup: loaded.rawBackup,
        };

        // Keep a safe default document open while the selected docId is in recovery.
        replaceDocument(createDefaultDocument());
        setDocId(trimmed);
        setActiveWorkspaceDocId(trimmed);
        setAutosaveEnabled(false);
        setRecovery(info);
        setRecoveryOpen(true);
        refreshWorkspaceDocs();
        pushToast("error", `Failed to load saved document. ${loaded.error}`);
        return;
      }

      activateLoadedDocument(trimmed, loaded.doc);

      if (loaded.recoveredFromBackup) {
        void window.setTimeout(() => {
          const res = saveWorkspaceDocument(trimmed, loaded.doc, { rotateBackup: false });
          if (!res.ok) {
            setPersistence({ state: "error", error: res.error, quota: res.quota });
            pushToast("error", res.error);
          }
        }, 0);
        window.setTimeout(() => pushToast("info", "Recovered document from LocalStorage backup."), 0);
      }

      if (loaded.migratedFrom) {
        void window.setTimeout(() => {
          const res = saveWorkspaceDocument(trimmed, loaded.doc);
          if (!res.ok) {
            setPersistence({ state: "error", error: res.error, quota: res.quota });
            pushToast("error", res.error);
          }
        }, 0);
        window.setTimeout(() => pushToast("info", `Migrated document from schema ${loaded.migratedFrom}.`), 0);
      }
    },
    [
      activateLoadedDocument,
      pushToast,
      refreshWorkspaceDocs,
      replaceDocument,
      stopAutosaveController,
    ],
  );

  const initialDocIdRef = useRef(docId);
  useEffect(() => {
    activateDocId(initialDocIdRef.current);
  }, [activateDocId]);

  useEffect(() => {
    const ctrl = startAutosave(editorStore, docId, { onStatus: setPersistence, shouldSave: () => autosaveEnabled });
    autosaveRef.current = ctrl;
    return () => {
      autosaveRef.current = null;
      ctrl.stop();
    };
  }, [autosaveEnabled, docId]);

  const lastPersistenceError = useRef<string | null>(null);
  useEffect(() => {
    if (persistence.state !== "error") return;
    if (persistence.error === lastPersistenceError.current) return;
    lastPersistenceError.current = persistence.error;
    window.setTimeout(() => pushToast("error", persistence.error), 0);
  }, [persistence, pushToast]);

  useEffect(() => {
    if (persistence.state !== "saved") return;
    refreshWorkspaceDocs();
  }, [persistence.state, refreshWorkspaceDocs]);

  const confirmProceedIfQuotaBlocked = useCallback(
    (actionLabel: string): boolean => {
      if (persistence.state !== "error" || !persistence.quota) return true;
      return window.confirm(
        `LocalStorage is full and autosave is paused.\n\n${actionLabel} may discard unsaved changes in the current document.\n\nExport JSON, then clear saved data to resume saving.\n\nContinue?`,
      );
    },
    [persistence],
  );

  const flushAutosaveIfEnabled = useCallback(() => {
    const ctrl = autosaveRef.current;
    if (!ctrl) return;
    if (!autosaveEnabled) return;
    if (ctrl.isQuotaBlocked()) return;
    ctrl.flush();
  }, [autosaveEnabled]);

  const onSwitchDocument = useCallback(
    (nextDocId: string) => {
      const trimmed = nextDocId.trim();
      if (!trimmed) return;
      if (trimmed === docId) return;
      if (activeTxn) return;
      if (!confirmProceedIfQuotaBlocked("Switching documents")) return;

      flushAutosaveIfEnabled();
      setDialog(null);
      setMobilePanel(null);
      activateDocId(trimmed);
    },
    [activeTxn, activateDocId, confirmProceedIfQuotaBlocked, docId, flushAutosaveIfEnabled],
  );

  const onCreateNewDocument = useCallback(() => {
    if (activeTxn) return;
    if (!confirmProceedIfQuotaBlocked("Creating a new document")) return;

    flushAutosaveIfEnabled();
    setDialog(null);
    setMobilePanel(null);

    const created = createWorkspaceDocument();
    if (!created.ok) {
      setPersistence({ state: "error", error: created.error, quota: created.quota });
      pushToast("error", created.error);
      return;
    }

    activateLoadedDocument(created.docId, created.doc);
    pushToast("info", "Created a new document.");
  }, [
    activeTxn,
    activateLoadedDocument,
    confirmProceedIfQuotaBlocked,
    flushAutosaveIfEnabled,
    pushToast,
  ]);

  const onDuplicateCurrentDocument = useCallback(() => {
    if (activeTxn) return;
    if (!confirmProceedIfQuotaBlocked("Duplicating the current document")) return;

    flushAutosaveIfEnabled();
    setDialog(null);
    setMobilePanel(null);

    const duplicated = duplicateWorkspaceDocument(doc);
    if (!duplicated.ok) {
      setPersistence({ state: "error", error: duplicated.error, quota: duplicated.quota });
      pushToast("error", duplicated.error);
      return;
    }

    activateLoadedDocument(duplicated.docId, duplicated.doc);
    pushToast("info", "Duplicated document.");
  }, [
    activeTxn,
    activateLoadedDocument,
    confirmProceedIfQuotaBlocked,
    doc,
    flushAutosaveIfEnabled,
    pushToast,
  ]);

  const onDeleteCurrentDocument = useCallback(() => {
    if (activeTxn) return;

    const title = doc.meta.title?.trim() ? doc.meta.title.trim() : docId;
    const ok = window.confirm(`Delete "${title}"?\n\nThis removes the saved snapshot and backup from LocalStorage.`);
    if (!ok) return;

    stopAutosaveController();

    const deleted = deleteWorkspaceDocument(docId);
    if (!deleted.ok) {
      pushToast("error", deleted.error);
      return;
    }

    refreshWorkspaceDocs();
    const remaining = listWorkspaceDocuments();

    if (remaining.length > 0) {
      activateDocId(remaining[0]!.id);
      pushToast("info", "Deleted document.");
      return;
    }

    const created = createWorkspaceDocument({ docId: "default" });
    if (!created.ok) {
      setPersistence({ state: "error", error: created.error, quota: created.quota });
      pushToast("error", created.error);
      return;
    }

    activateLoadedDocument(created.docId, created.doc);
    pushToast("info", "Deleted document.");
  }, [
    activeTxn,
    activateDocId,
    activateLoadedDocument,
    doc,
    docId,
    pushToast,
    refreshWorkspaceDocs,
    stopAutosaveController,
  ]);

  const onOpenRenameDialog = useCallback(() => {
    setRenameValue(doc.meta.title ?? "");
    setRenameOpen(true);
  }, [doc.meta.title]);

  const onConfirmRename = useCallback(() => {
    const title = renameValue.trim();
    if (!title) {
      pushToast("error", "Document title cannot be empty.");
      return;
    }

    dispatch({ type: "UPDATE_META", patch: { title } }, { historyLabel: "Rename" });
    setRenameOpen(false);

    // Persist immediately so export filenames and workspace metadata stay in sync.
    const ctrl = autosaveRef.current;
    if (ctrl && autosaveEnabled && !ctrl.isQuotaBlocked()) {
      ctrl.flush();
    } else {
      setPersistence({ state: "saving" });
      const res = saveWorkspaceDocument(docId, editorStore.getState().doc);
      if (!res.ok) {
        setPersistence({ state: "error", error: res.error, quota: res.quota });
        pushToast("error", res.error);
        return;
      }
      setPersistence({ state: "saved", at: Date.now() });
    }

    refreshWorkspaceDocs();
    pushToast("info", "Renamed document.");
  }, [
    autosaveEnabled,
    dispatch,
    docId,
    pushToast,
    refreshWorkspaceDocs,
    renameValue,
  ]);

  const onClearSavedAfterQuota = useCallback(
    async (targetDocId: string) => {
      const ok = window.confirm(
        "This will clear the saved snapshot and backup from LocalStorage. Your current document will remain open and will be saved again. Continue?",
      );
      if (!ok) return;

      const cleared = clearLocalStorage(targetDocId);
      if (!cleared.ok) {
        pushToast("error", cleared.error);
        return;
      }

      autosaveRef.current?.resetQuotaBlock();
      setAutosaveEnabled(true);

      setPersistence({ state: "saving" });
      const res = saveWorkspaceDocument(targetDocId, doc, { rotateBackup: false });
      if (!res.ok) {
        setPersistence({ state: "error", error: res.error, quota: res.quota });
        pushToast("error", res.error);
        return;
      }

      setPersistence({ state: "saved", at: Date.now() });
      refreshWorkspaceDocs();
      pushToast("info", "Cleared saved snapshots and resumed saving.");
    },
    [doc, pushToast, refreshWorkspaceDocs],
  );

  const onConfirmReset = useCallback(() => {
    const cleared = clearLocalStorage(docId);
    if (!cleared.ok) {
      pushToast("error", cleared.error);
      return;
    }

    const next = createDefaultDocument();
    replaceDocument(next);
    setResetOpen(false);
    setRecovery(null);
    setRecoveryOpen(false);
    setAutosaveEnabled(true);
    autosaveRef.current?.resetQuotaBlock();

    setPersistence({ state: "saving" });
    const res = saveWorkspaceDocument(docId, next, { rotateBackup: false });
    if (!res.ok) {
      setPersistence({ state: "error", error: res.error, quota: res.quota });
      pushToast("error", res.error);
      return;
    }

    setPersistence({ state: "saved", at: Date.now() });
    refreshWorkspaceDocs();
    pushToast("info", "Reset document.");
  }, [docId, pushToast, refreshWorkspaceDocs, replaceDocument]);

  const onOverwriteSavedAndEnableAutosave = useCallback(() => {
    const ok = window.confirm(
      "This will permanently delete the saved snapshot and backup from LocalStorage. Export any recovery JSON first. Continue?",
    );
    if (!ok) return;

    const cleared = clearLocalStorage(docId);
    if (!cleared.ok) {
      pushToast("error", cleared.error);
      return;
    }

    setRecovery(null);
    setRecoveryOpen(false);
    setAutosaveEnabled(true);
    autosaveRef.current?.resetQuotaBlock();

    setPersistence({ state: "saving" });
    const res = saveWorkspaceDocument(docId, doc, { rotateBackup: false });
    if (!res.ok) {
      setPersistence({ state: "error", error: res.error, quota: res.quota });
      pushToast("error", res.error);
      return;
    }

    setPersistence({ state: "saved", at: Date.now() });
    refreshWorkspaceDocs();
    pushToast("info", "Saving re-enabled.");
  }, [doc, docId, pushToast, refreshWorkspaceDocs]);

  const onLoadBackupForRecovery = useCallback(() => {
    const loaded = loadBackupFromLocalStorage(docId);
    if (!loaded.ok) {
      pushToast("error", `Failed to load backup snapshot. ${loaded.error}`);
      return;
    }

    replaceDocument(loaded.doc);
    pushToast("info", "Loaded backup snapshot. Saving remains disabled until you clear the newer saved document.");
  }, [docId, pushToast, replaceDocument]);

  const themeStyle = useMemo(() => themeToCssVars(doc.theme) as CSSProperties, [doc.theme]);

  const isPreview = mode === "preview";
  const renderMode = isPreview ? "preview" : "editor";
  const selectionBreadcrumb = useMemo(() => buildSelectionBreadcrumb(doc, selectedId), [doc, selectedId]);

  const onSelect = useCallback(
    (nodeId: NodeId) => {
      dispatch({ type: "SET_SELECTED", nodeId });
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

  const insertFromPalette = useCallback(
    (nodeType: NodeType) => {
      if (isPreview) return;
      const subtree = buildPaletteSubtree(nodeType, idFactory);
      const target = findInsertTarget(doc, selectedId, subtree.nodes[subtree.rootId].type);
      if (!target) {
        pushToast("error", `Cannot add ${blockRegistry[nodeType].label} here.`);
        return;
      }
      dispatch(
        { type: "INSERT_SUBTREE", parentId: target.parentId, index: target.index, subtree },
        { historyLabel: `Add ${blockRegistry[nodeType].label}` },
      );
    },
    [dispatch, doc, idFactory, isPreview, pushToast, selectedId],
  );

  const insertFromPaletteAndMaybeClose = useCallback(
    (nodeType: NodeType) => {
      insertFromPalette(nodeType);
      if (isNarrow) setMobilePanel(null);
    },
    [insertFromPalette, isNarrow],
  );

  const dndEnabled = !isPreview && !activeTxn;

  const clearDndState = useCallback(() => {
    setActiveDrag(null);
    setDropIntent(null);
    setDropInvalid(null);
    setDropIndicator(null);
    dragStartPoint.current = null;
    lastIntentKey.current = null;
    latestRef.current.activeDrag = null;
    latestRef.current.dropIntent = null;
    latestRef.current.dropInvalid = null;
  }, []);

  const computeDropFromEvent = useCallback(
    (payload: DragPayload, event: DragMoveEvent | DragEndEvent): { intent: DropIntent | null; invalid: typeof dropInvalid } => {
      const start = dragStartPoint.current;
      const pointer = start
        ? { x: start.x + event.delta.x, y: start.y + event.delta.y }
        : pointerFromTranslatedRect(event.active.rect.current.translated);

      if (!pointer) return { intent: null, invalid: null };

      const overContainerId = parseContainerDropId(event.over?.id);
      const res = computeDropIntent({ doc, breakpoint, source: payload, overContainerId, pointer });
      if (res.ok) return { intent: res.intent, invalid: null };
      if (res.overId) return { intent: null, invalid: { overId: res.overId, reason: res.reason } };
      return { intent: null, invalid: null };
    },
    [breakpoint, doc],
  );

  const updateDropFromEvent = useCallback(
    (payload: DragPayload, event: DragMoveEvent | DragEndEvent) => {
      const next = computeDropFromEvent(payload, event);
      if (next.intent) {
        const key = `${next.intent.parentId}|${next.intent.index}`;
        if (key !== lastIntentKey.current) {
          lastIntentKey.current = key;
          setDropIntent(next.intent);
        }
        latestRef.current.dropIntent = next.intent;
        latestRef.current.dropInvalid = null;
        if (dropInvalid !== null) setDropInvalid(null);
        const canvasEl = canvasBodyRef.current;
        const geom = canvasEl ? computeDropIndicatorGeometry(doc, next.intent, canvasEl) : null;
        setDropIndicator((prev) => (isSameDropIndicator(prev, geom) ? prev : geom));
        return;
      }

      lastIntentKey.current = null;
      if (dropIntent !== null) setDropIntent(null);
      latestRef.current.dropIntent = null;
      if (next.invalid) {
        latestRef.current.dropInvalid = next.invalid;
        setDropInvalid((prev) => {
          if (prev && prev.overId === next.invalid!.overId && prev.reason === next.invalid!.reason) return prev;
          return next.invalid;
        });
      } else if (dropInvalid !== null) {
        latestRef.current.dropInvalid = null;
        setDropInvalid(null);
      }
      setDropIndicator(null);
    },
    [computeDropFromEvent, doc, dropIntent, dropInvalid],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!dndEnabled) return;
      const nodeId = parseNodeDragId(event.active.id);
      const paletteType = parsePaletteDragId(event.active.id);
      const payload: DragPayload | null = nodeId
        ? { kind: "node", nodeId }
        : paletteType
          ? { kind: "palette", nodeType: paletteType }
          : null;
      if (!payload) return;

      dragStartPoint.current = pointerFromActivatorEvent(event.activatorEvent);
      lastIntentKey.current = null;
      setActiveDrag(payload);
      latestRef.current.activeDrag = payload;
      setDropIntent(null);
      setDropInvalid(null);
      setDropIndicator(null);
      latestRef.current.dropIntent = null;
      latestRef.current.dropInvalid = null;

      if (payload.kind === "node") {
        dispatch({ type: "SET_SELECTED", nodeId: payload.nodeId });
      }
    },
    [dispatch, dndEnabled],
  );

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!dndEnabled) return;
      if (!activeDrag) return;
      updateDropFromEvent(activeDrag, event);
    },
    [activeDrag, dndEnabled, updateDropFromEvent],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const payload = activeDrag;
      if (!payload) return;

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
        const subtree = buildPaletteSubtree(payload.nodeType, idFactory);
        beginTransaction(`DnD add ${blockRegistry[payload.nodeType].label}`);
        dispatch({ type: "INSERT_SUBTREE", parentId: intent.parentId, index: intent.index, subtree });
        commitTransaction();
      } else {
        const moving = doc.nodes[payload.nodeId];
        const fromParentId = moving?.parentId ?? null;
        if (!moving || !fromParentId) {
          pushToast("error", "Dragged node no longer exists.");
          clearDndState();
          return;
        }

        const fromParent = doc.nodes[fromParentId];
        const fromIndex = fromParent ? fromParent.children.indexOf(moving.id) : -1;
        const isSameParent = fromParentId === intent.parentId;
        const isNoOp = isSameParent && fromIndex === intent.index;

        if (!isNoOp) {
          beginTransaction(`DnD move ${blockRegistry[moving.type].label}`);
          dispatch({ type: "MOVE_NODE", nodeId: moving.id, parentId: intent.parentId, index: intent.index });
          commitTransaction();
        }
      }

      dispatch({ type: "SET_HOVERED", nodeId: null });
      clearDndState();
    },
    [
      activeDrag,
      beginTransaction,
      clearDndState,
      commitTransaction,
      computeDropFromEvent,
      dispatch,
      dndEnabled,
      doc.nodes,
      idFactory,
      pushToast,
    ],
  );

  const onDragCancel = useCallback(() => {
    clearDndState();
  }, [clearDndState]);

  const dragOverlayLabel = useMemo(() => {
    if (!activeDrag) return null;
    if (activeDrag.kind === "palette") return `Add ${blockRegistry[activeDrag.nodeType].label}`;
    const node = doc.nodes[activeDrag.nodeId];
    return node ? `Move ${blockRegistry[node.type].label}` : "Move";
  }, [activeDrag, doc.nodes]);

  return (
    <div className={styles.themeRoot} style={themeStyle}>
      <DndContext
        accessibility={{ announcements: dndAnnouncements, screenReaderInstructions: dndScreenReaderInstructions }}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        autoScroll
      >
      <header className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <h1 className={styles.brand}>Page Builder</h1>

          <div className={styles.controls}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>Document</span>
            <select
              value={docId}
              onChange={(e) => onSwitchDocument(e.target.value)}
              aria-label="Document"
              disabled={Boolean(activeTxn)}
            >
              {workspaceDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.title && d.title.trim()) ? d.title.trim() : d.id}
                </option>
              ))}
              {workspaceDocs.some((d) => d.id === docId) ? null : <option value={docId}>{docId}</option>}
            </select>
          </label>

          <button
            className={styles.button}
            type="button"
            onClick={onCreateNewDocument}
            disabled={Boolean(activeTxn)}
            aria-label="New document"
          >
            New
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={onOpenRenameDialog}
            disabled={Boolean(activeTxn) || !autosaveEnabled || Boolean(recovery)}
            aria-label="Rename document"
          >
            Rename
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={onDuplicateCurrentDocument}
            disabled={Boolean(activeTxn) || Boolean(recovery)}
            aria-label="Duplicate document"
          >
            Duplicate
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={onDeleteCurrentDocument}
            disabled={Boolean(activeTxn) || Boolean(recovery)}
            aria-label="Delete document"
          >
            Delete
          </button>

          <label className={styles.control}>
            <span className={styles.controlLabel}>Mode</span>
            <select
              value={mode}
              onChange={(e) => dispatch({ type: "SET_MODE", mode: e.target.value as typeof mode })}
              aria-label="Mode"
            >
              <option value="edit">Edit</option>
              <option value="preview">Preview</option>
            </select>
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>Breakpoint</span>
            <select
              value={breakpoint}
              onChange={(e) => dispatch({ type: "SET_BREAKPOINT", breakpoint: e.target.value as Breakpoint })}
              aria-label="Breakpoint"
            >
              <option value="lg">Desktop</option>
              <option value="md">Tablet</option>
              <option value="sm">Mobile</option>
              <option value="base">Base</option>
            </select>
          </label>

          <button
            className={styles.button}
            type="button"
            onClick={undo}
            disabled={undoStackLen === 0 || Boolean(activeTxn)}
            aria-label="Undo"
          >
            Undo
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={redo}
            disabled={redoStackLen === 0 || Boolean(activeTxn)}
            aria-label="Redo"
          >
            Redo
          </button>

          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setMobilePanel(null);
              setDialog("shortcuts");
            }}
            aria-label="Keyboard shortcuts"
          >
            Shortcuts
          </button>

          {isNarrow ? (
            <>
              <button
                className={styles.button}
                type="button"
                onClick={() => setMobilePanel((prev) => (prev === "palette" ? null : "palette"))}
                aria-label="Toggle palette"
                aria-haspopup="dialog"
                aria-expanded={mobilePanel === "palette"}
              >
                Palette
              </button>
              <button
                className={styles.button}
                type="button"
                onClick={() => setMobilePanel((prev) => (prev === "inspector" ? null : "inspector"))}
                aria-label="Toggle inspector"
                aria-haspopup="dialog"
                aria-expanded={mobilePanel === "inspector"}
              >
                Inspector
              </button>
            </>
          ) : null}

          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setMobilePanel(null);
              setDialog("import");
            }}
            aria-label="Import JSON"
          >
            Import
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setMobilePanel(null);
              setDialog("export");
            }}
            aria-label="Export"
          >
            Export
          </button>

          <span className={styles.status} role="status" aria-label="Status">
            {!autosaveEnabled
              ? "Autosave off"
              : persistence.state === "saving"
                ? "Saving"
                : persistence.state === "error" && persistence.quota
                  ? "Storage full"
                  : persistence.state === "error"
                    ? "Save error"
                    : persistence.state === "saved"
                      ? `Saved ${formatShortTime(persistence.at)}`
                      : undoStackLen > 0
                        ? "Unsaved"
                        : "Idle"}
          </span>
          {issues.length > 0 ? (
            <span className={issues.some((i) => i.level === "error") ? styles.statusError : styles.statusWarn} role="status" aria-label="Validation status">
              {issues.filter((i) => i.level === "error").length > 0
                ? `${issues.filter((i) => i.level === "error").length} errors`
                : `${issues.length} warnings`}
            </span>
          ) : null}

          <button
            className={styles.button}
            type="button"
            onClick={() => autosaveRef.current?.flush()}
            disabled={!autosaveEnabled || persistence.state === "saving" || Boolean(activeTxn) || (persistence.state === "error" && persistence.quota)}
            aria-label="Save now"
          >
            Save now
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={Boolean(activeTxn)}
            aria-label="Reset document"
          >
            Reset
          </button>
        </div>
        </div>

        {recovery ? (
          <div className={styles.banner} data-kind="error" role="status" aria-label="Recovery status">
            <div className={styles.bannerMessage}>
              Saved data could not be loaded ({recovery.code}). Autosave is disabled until you recover or reset.
            </div>
            <div className={styles.bannerActions}>
              <button type="button" className={styles.bannerButton} onClick={() => setRecoveryOpen(true)}>
                Recovery
              </button>
              <button type="button" className={styles.bannerButton} onClick={() => setResetOpen(true)}>
                Reset
              </button>
            </div>
          </div>
        ) : persistence.state === "error" && persistence.quota ? (
          <div className={styles.banner} data-kind="error" role="status" aria-label="Storage status">
            <div className={styles.bannerMessage}>
              LocalStorage is full. Autosave is paused. Export JSON, then clear saved data to resume saving.
            </div>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={styles.bannerButton}
                onClick={() => {
                  setMobilePanel(null);
                  setDialog("export");
                }}
              >
                Export
              </button>
              <button type="button" className={styles.bannerButton} onClick={() => void onClearSavedAfterQuota(docId)}>
                Clear saved
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main className={styles.main} data-narrow={isNarrow ? "true" : "false"}>
        {!isNarrow ? (
          <aside className={styles.panel} aria-label="Palette">
            <div className={styles.panelTitle}>Palette</div>
            <div className={styles.panelBody}>
              <PaletteList disabled={!dndEnabled} onInsert={insertFromPaletteAndMaybeClose} />
            </div>
          </aside>
        ) : null}

        <section className={styles.canvas} aria-label="Canvas">
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
              {selectionBreadcrumb}
            </div>
            {dropInvalid ? (
              <div className={styles.dropInvalidMessage} role="status" aria-label="Invalid drop target">
                {dropInvalid.reason}
              </div>
            ) : null}
            <div ref={canvasBodyRef} className={styles.canvasBody} onClick={onCanvasClick}>
              <RenderDocument
                doc={doc}
                mode={renderMode}
                breakpoint={breakpoint}
                disableNavigation={isPreview}
                selectedId={renderMode === "editor" ? selectedId : null}
                hoveredId={renderMode === "editor" ? hoveredId : null}
                enableDnd={renderMode === "editor" ? dndEnabled : false}
                draggingId={activeDrag?.kind === "node" ? activeDrag.nodeId : null}
                dropTargetId={dropIntent?.parentId ?? null}
                dropInvalidId={dropInvalid?.overId ?? null}
                onSelect={renderMode === "editor" ? onSelect : undefined}
                onHover={renderMode === "editor" ? onHover : undefined}
              />
              {dropIndicator ? (
                <div
                  className={dropIndicator.kind === "placeholder" ? styles.dropPlaceholder : styles.dropLine}
                  style={{
                    left: dropIndicator.left,
                    top: dropIndicator.top,
                    width: dropIndicator.width,
                    height: dropIndicator.height,
                  }}
                  data-drop-indicator="true"
                  data-drop-parent={dropIndicator.parentId}
                  data-drop-index={String(dropIndicator.index)}
                  data-drop-axis={dropIndicator.axis}
                />
              ) : null}
            </div>
          </div>
        </section>

        {!isNarrow ? (
          <aside className={styles.panel} aria-label="Inspector">
            <div className={styles.panelTitle}>Inspector</div>
            <div className={styles.panelBody}>
              <InspectorPanel
                doc={doc}
                issues={issues}
                selectedId={selectedId}
                mode={mode}
                breakpoint={breakpoint}
                tab={inspectorTab}
                onTabChange={setInspectorTab}
                dispatch={dispatch}
              />
            </div>
          </aside>
        ) : null}
      </main>

      {isNarrow && mobilePanel === "palette" ? (
        <Drawer title="Palette" side="left" onClose={() => setMobilePanel(null)}>
          <PaletteList disabled={!dndEnabled} onInsert={insertFromPaletteAndMaybeClose} />
        </Drawer>
      ) : null}

      {isNarrow && mobilePanel === "inspector" ? (
        <Drawer title="Inspector" side="right" onClose={() => setMobilePanel(null)}>
          <InspectorPanel
            doc={doc}
            issues={issues}
            selectedId={selectedId}
            mode={mode}
            breakpoint={breakpoint}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            dispatch={dispatch}
          />
        </Drawer>
      ) : null}

      {toasts.length > 0 ? (
        <div className={styles.toastHost} aria-live="polite" aria-label="Notifications">
          {toasts.map((t) => (
            <div key={t.id} className={t.kind === "error" ? styles.toastError : styles.toast} role="status">
              <div className={styles.toastMessage}>{t.message}</div>
              <button type="button" className={styles.toastClose} onClick={() => dismissToast(t.id)} aria-label="Dismiss">
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {dialog === "shortcuts" ? <ShortcutsDialog onClose={() => setDialog(null)} /> : null}

      {dialog === "export" ? (
        <ExportDialog
          doc={doc}
          breakpoint={breakpoint}
          onClose={() => setDialog(null)}
          onToast={pushToast}
        />
      ) : null}

      {dialog === "import" ? (
        <ImportDialog
          currentDoc={doc}
          idFactory={idFactory}
          dispatch={dispatch}
          beginTransaction={beginTransaction}
          commitTransaction={commitTransaction}
          replaceDocument={replaceDocument}
          onClose={() => setDialog(null)}
          onToast={pushToast}
        />
      ) : null}

      {resetOpen ? <ResetDialog onClose={() => setResetOpen(false)} onConfirm={onConfirmReset} /> : null}

      {renameOpen ? (
        <Modal title="Rename document" onClose={() => setRenameOpen(false)}>
          <div className={styles.dialogSection}>
            <label className={styles.control}>
              <span className={styles.controlLabel}>Title</span>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Document title"
                autoFocus
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.button} onClick={onConfirmRename}>
                Rename
              </button>
              <button type="button" className={styles.button} onClick={() => setRenameOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {recoveryOpen && recovery ? (
        <RecoveryDialog
          recovery={recovery}
          docId={docId}
          onClose={() => setRecoveryOpen(false)}
          onOpenReset={() => setResetOpen(true)}
          onOverwriteSavedAndEnableAutosave={onOverwriteSavedAndEnableAutosave}
          onLoadBackup={onLoadBackupForRecovery}
        />
      ) : null}

      <DragOverlay dropAnimation={prefersReducedMotion ? null : undefined}>
        {activeDrag ? <div className={styles.dragOverlay}>{dragOverlayLabel}</div> : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}

function PaletteList(props: { disabled: boolean; onInsert: (nodeType: NodeType) => void }) {
  return (
    <ul className={styles.paletteList} aria-disabled={props.disabled}>
      {Object.values(blockRegistry)
        .filter((b) => b.type !== "page" && b.type !== "column")
        .map((b) => (
          <PaletteListItem key={b.type} block={b} disabled={props.disabled} onInsert={props.onInsert} />
        ))}
    </ul>
  );
}

function PaletteListItem(props: {
  block: (typeof blockRegistry)[NodeType];
  disabled: boolean;
  onInsert: (nodeType: NodeType) => void;
}) {
  const draggable = useDraggable({
    id: paletteDragId(props.block.type),
    disabled: props.disabled,
    data: { kind: "palette", nodeType: props.block.type } satisfies DragPayload,
  });
  const { attributes, listeners, setActivatorNodeRef, setNodeRef } = draggable;

  return (
    <li
      ref={setNodeRef}
      className={styles.paletteItem}
      data-palette-block-type={props.block.type}
      data-dnd-palette-item="true"
    >
      <button
        type="button"
        className={styles.paletteButton}
        disabled={props.disabled}
        onClick={() => props.onInsert(props.block.type)}
      >
        {props.block.label}
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.paletteDragHandle}
        disabled={props.disabled}
        aria-label={`Drag ${props.block.label}`}
        data-dnd-handle="true"
        {...attributes}
        {...listeners}
      >
        Drag
      </button>
    </li>
  );
}

function focusElement(el: HTMLElement | null) {
  if (!el) return;
  if (typeof document !== "undefined" && !document.contains(el)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=\"hidden\"])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex=\"-1\"])",
    "[contenteditable=\"true\"]",
  ];

  return Array.from(root.querySelectorAll<HTMLElement>(selectors.join(","))).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

function Drawer(props: { title: string; side: "left" | "right"; children: React.ReactNode; onClose: () => void }) {
  const { title, side, children, onClose } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusElement(rootRef.current);
    return () => focusElement(returnFocusRef.current);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        focusElement(root);
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!active || active === root || !root.contains(active)) {
        e.preventDefault();
        focusElement(e.shiftKey ? last : first);
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          focusElement(last);
        }
      } else {
        if (active === last) {
          e.preventDefault();
          focusElement(first);
        }
      }
    },
    [rootRef],
  );

  return (
    <div
      className={styles.drawerOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        className={styles.drawer}
        data-side={side}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>{title}</div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close panel">
            x
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </div>
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const getMatches = () => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(() => getMatches());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    if ("addEventListener" in mql) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    const legacy = mql as unknown as {
      addListener: (listener: (e: MediaQueryListEvent) => void) => void;
      removeListener: (listener: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, [query]);

  return matches;
}

function Modal(props: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { title, children, onClose } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusElement(rootRef.current);
    return () => focusElement(returnFocusRef.current);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        focusElement(root);
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!active || active === root || !root.contains(active)) {
        e.preventDefault();
        focusElement(e.shiftKey ? last : first);
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          focusElement(last);
        }
      } else {
        if (active === last) {
          e.preventDefault();
          focusElement(first);
        }
      }
    },
    [rootRef],
  );

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{title}</div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close dialog">
            x
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

function ShortcutsDialog(props: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <div className={styles.dialogSectionTitle}>Editor</div>
        <table className={styles.shortcutsTable}>
          <tbody>
            <tr>
              <th scope="row">
                <kbd>Delete</kbd> / <kbd>Backspace</kbd>
              </th>
              <td>Delete the selected block.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>D</kbd>
              </th>
              <td>Duplicate the selected block.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd>
              </th>
              <td>Undo.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Y</kbd>)
              </th>
              <td>Redo.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>C</kbd>
              </th>
              <td>Copy the selected block.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>X</kbd>
              </th>
              <td>Cut the selected block.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>V</kbd>
              </th>
              <td>Paste into the closest valid container.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Alt</kbd>+<kbd>ArrowUp</kbd>/<kbd>ArrowDown</kbd>
              </th>
              <td>Move the selected block up/down among siblings.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Enter</kbd>
              </th>
              <td>Toggle Edit/Preview mode.</td>
            </tr>
            <tr>
              <th scope="row">
                <kbd>Esc</kbd>
              </th>
              <td>Close dialogs/panels or select the Page root.</td>
            </tr>
          </tbody>
        </table>

        <div className={styles.muted}>Shortcuts are suppressed while typing in inputs, textareas, or contenteditable fields.</div>
      </div>
    </Modal>
  );
}

function ExportDialog(props: { doc: Document; breakpoint: Breakpoint; onClose: () => void; onToast: (k: "info" | "error", m: string) => void }) {
  const [mode, setMode] = useState<"full" | "snippet">("full");

  const warnings = useMemo(() => collectHtmlExportWarnings(props.doc), [props.doc]);

  const onDownloadJson = () => {
    const filename = `${sanitizeFilename(props.doc.meta.title || "page")}.pagebuilder.json`;
    const { json } = exportDocumentToJson(props.doc);
    downloadText(filename, json, "application/json");
    props.onToast("info", "Exported JSON.");
  };

  const onDownloadHtml = () => {
    const filename = `${sanitizeFilename(props.doc.meta.title || "page")}.${props.breakpoint}.html`;
    void exportDocumentToHtml(props.doc, { breakpoint: props.breakpoint, mode })
      .then((res) => {
        downloadText(filename, res.html, "text/html");
        props.onToast("info", res.warnings.length > 0 ? `Exported HTML with ${res.warnings.length} warning(s).` : "Exported HTML.");
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Failed to export HTML.";
        props.onToast("error", msg);
      });
  };

  return (
    <Modal title="Export" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <div className={styles.dialogRow}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>HTML</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="HTML export mode">
              <option value="full">Full document</option>
              <option value="snippet">Snippet</option>
            </select>
          </label>
        </div>

        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={onDownloadJson}>
            Download JSON
          </button>
          <button type="button" className={styles.button} onClick={onDownloadHtml}>
            Download HTML ({props.breakpoint})
          </button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className={styles.dialogSection}>
          <div className={styles.dialogSectionTitle}>Warnings</div>
          <ul className={styles.dialogList}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

function ImportDialog(props: {
  currentDoc: Document;
  idFactory: IdFactory;
  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
  beginTransaction: (label: string) => void;
  commitTransaction: () => void;
  replaceDocument: (doc: Document) => void;
  onClose: () => void;
  onToast: (k: "info" | "error", m: string) => void;
}) {
  const [raw, setRaw] = useState<string>("");
  const [parseAttempted, setParseAttempted] = useState(false);

  const parsed = useMemo(() => {
    if (!raw.trim()) return { ok: false as const, error: "Paste JSON or choose a file." };
    const res = parseDocumentJsonText(raw);
    if (!res.ok) return { ok: false as const, error: res.error };
    const issues = validateDocument(res.doc);
    return { ok: true as const, doc: res.doc, issues, migratedFrom: res.migratedFrom };
  }, [raw]);

  const onChooseFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    setParseAttempted(true);
  };

  const applyReplace = () => {
    setParseAttempted(true);
    if (!parsed.ok) return;
    props.replaceDocument(parsed.doc);
    props.onToast("info", "Imported document (replaced).");
    props.onClose();
  };

  const applyMerge = () => {
    setParseAttempted(true);
    if (!parsed.ok) return;
    const importedRoot = parsed.doc.nodes[parsed.doc.rootId];
    const currentRoot = props.currentDoc.nodes[props.currentDoc.rootId];

    if (!importedRoot || importedRoot.type !== "page" || !currentRoot || currentRoot.type !== "page") {
      props.onToast("error", "Merge expects a Page root document.");
      return;
    }

    const sections = importedRoot.children.filter((id) => parsed.doc.nodes[id]?.type === "section");
    if (sections.length === 0) {
      props.onToast("error", "Imported document has no sections to merge.");
      return;
    }

    const insertAtStart = props.currentDoc.nodes[props.currentDoc.rootId]?.children.length ?? 0;

    props.beginTransaction("Import merge");
    let offset = 0;
    for (const sectionId of sections) {
      const subtree = cloneSubtree(parsed.doc, sectionId);
      const remapped = remapIds(subtree, props.idFactory);
      props.dispatch(
        { type: "INSERT_SUBTREE", parentId: props.currentDoc.rootId, index: insertAtStart + offset, subtree: remapped },
        { historyLabel: "Merge" },
      );
      offset++;
    }
    props.commitTransaction();

    props.onToast("info", `Merged ${sections.length} section(s).`);
    props.onClose();
  };

  return (
    <Modal title="Import JSON" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>File</span>
          <input type="file" accept="application/json,.json" onChange={(e) => void onChooseFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className={styles.dialogSection}>
        <div className={styles.dialogSectionTitle}>JSON</div>
        <textarea
          className={styles.textarea}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setParseAttempted(true);
          }}
          placeholder='Paste a document JSON (must include meta.schemaVersion)'
          rows={10}
        />
      </div>

      <div className={styles.dialogSection}>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={applyReplace} disabled={!parsed.ok}>
            Replace
          </button>
          <button type="button" className={styles.button} onClick={applyMerge} disabled={!parsed.ok}>
            Merge sections
          </button>
        </div>

        {parseAttempted && !parsed.ok ? <div className={styles.dialogError}>{parsed.error}</div> : null}

        {parsed.ok ? (
          <div className={styles.dialogSummary}>
            <div>
              <strong>Title:</strong> {parsed.doc.meta.title}
            </div>
            <div>
              <strong>Schema:</strong> {parsed.doc.meta.schemaVersion}
            </div>
            {parsed.migratedFrom ? (
              <div>
                <strong>Migrated from:</strong> {parsed.migratedFrom}
              </div>
            ) : null}
            <div>
              <strong>Nodes:</strong> {Object.keys(parsed.doc.nodes).length}
            </div>
            <div>
              <strong>Validation:</strong>{" "}
              {parsed.issues.some((i) => i.level === "error")
                ? `${parsed.issues.filter((i) => i.level === "error").length} errors`
                : `${parsed.issues.length} warnings`}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ResetDialog(props: { onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Reset document" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <p className={styles.muted}>
          This clears the saved snapshot and backup in LocalStorage and replaces the current document with the default
          template.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={props.onConfirm}>
            Reset
          </button>
          <button type="button" className={styles.button} onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecoveryDialog(props: {
  recovery: RecoveryInfo;
  docId: string;
  onClose: () => void;
  onOpenReset: () => void;
  onOverwriteSavedAndEnableAutosave: () => void;
  onLoadBackup: () => void;
}) {
  const { recovery } = props;
  const isFuture = recovery.code === "FUTURE_VERSION";

  const primaryFilename = `recovery.${sanitizeFilename(props.docId)}.primary.json`;
  const backupFilename = `recovery.${sanitizeFilename(props.docId)}.backup.json`;

  return (
    <Modal title="Recovery" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <div className={styles.dialogError}>
          <strong>Load failed:</strong> {recovery.error}
        </div>

        {isFuture ? (
          <p className={styles.muted}>
            A document saved by a newer app version was found. To avoid data loss, saving is disabled until you export the
            saved JSON and clear LocalStorage.
          </p>
        ) : (
          <p className={styles.muted}>
            The saved snapshot could not be loaded. You can export the raw JSON for manual recovery and reset the editor
            to a fresh document.
          </p>
        )}

        <div className={styles.dialogActions}>
          {recovery.rawPrimary ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => downloadText(primaryFilename, recovery.rawPrimary ?? "", "application/json")}
            >
              Download primary JSON
            </button>
          ) : null}
          {recovery.rawBackup ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => downloadText(backupFilename, recovery.rawBackup ?? "", "application/json")}
            >
              Download backup JSON
            </button>
          ) : null}
          {isFuture && recovery.rawBackup ? (
            <button type="button" className={styles.button} onClick={props.onLoadBackup}>
              Load backup into editor
            </button>
          ) : null}
          <button type="button" className={styles.button} onClick={props.onOverwriteSavedAndEnableAutosave}>
            {isFuture ? "Enable saving (overwrite LocalStorage)" : "Enable saving (clear LocalStorage)"}
          </button>
          <button type="button" className={styles.button} onClick={props.onOpenReset}>
            Reset document
          </button>
        </div>

        {recovery.rawPrimary ? (
          <div className={styles.dialogSection}>
            <div className={styles.dialogSectionTitle}>Primary snapshot (raw)</div>
            <textarea className={styles.textarea} value={recovery.rawPrimary} readOnly rows={8} />
          </div>
        ) : null}

        {recovery.rawBackup ? (
          <div className={styles.dialogSection}>
            <div className={styles.dialogSectionTitle}>Backup snapshot (raw)</div>
            <textarea className={styles.textarea} value={recovery.rawBackup} readOnly rows={8} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function InspectorPanel(props: {
  doc: Document;
  issues: ValidationIssue[];
  selectedId: NodeId | null;
  mode: Mode;
  breakpoint: Breakpoint;
  tab: "content" | "style";
  onTabChange: (tab: "content" | "style") => void;
  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
}) {
  const node = props.selectedId ? props.doc.nodes[props.selectedId] : undefined;
  if (!node) {
    return <p className={styles.muted}>Select a node to edit.</p>;
  }

  const def = blockRegistry[node.type];
  const locked = Boolean(node.constraints?.locked);
  const disabled = locked || props.mode === "preview";

  const nodeIssues = props.issues.filter((i) => i.nodeId === node.id);
  const errorCount = props.issues.filter((i) => i.level === "error").length;
  const warningCount = props.issues.length - errorCount;

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHeader}>
        <div className={styles.inspectorTitleRow}>
          <div className={styles.inspectorNodeLabel}>{def.label}</div>
          {locked ? <span className={styles.badge}>Locked</span> : null}
          {node.constraints?.hidden ? <span className={styles.badge}>Hidden</span> : null}
        </div>
        <div className={styles.inspectorNodeMeta}>{node.id}</div>
      </div>

      <div className={styles.tabList} role="tablist" aria-label="Inspector tabs">
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "content"}
          className={props.tab === "content" ? styles.tabButtonActive : styles.tabButton}
          onClick={() => props.onTabChange("content")}
        >
          Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === "style"}
          className={props.tab === "style" ? styles.tabButtonActive : styles.tabButton}
          onClick={() => props.onTabChange("style")}
        >
          Style
        </button>
      </div>

      {props.mode === "preview" ? (
        <div className={styles.inlineNotice} role="note">
          Preview mode is read-only. Switch to Edit to make changes.
        </div>
      ) : null}

      {props.tab === "content" ? (
        <InspectorContent
          node={node}
          disabled={disabled}
          nodeIssues={nodeIssues}
          onPatchProps={(patch, keyForCoalesce) =>
            props.dispatch(
              { type: "UPDATE_PROPS", nodeId: node.id, patch },
              { coalesceKey: `props:${node.id}:${keyForCoalesce}`, historyLabel: "Edit" },
            )
          }
          onResetProp={(propKey) => {
            const defaultValue = (def.defaultProps as Record<string, unknown>)[propKey];
            props.dispatch(
              { type: "UPDATE_PROPS", nodeId: node.id, patch: { [propKey]: defaultValue } },
              { historyLabel: "Reset" },
            );
          }}
        />
      ) : null}

      {props.tab === "style" ? (
        <InspectorStyle
          node={node}
          disabled={disabled}
          nodeIssues={nodeIssues}
          breakpoint={props.breakpoint}
          onPatchStyle={(patch, keyForCoalesce) =>
            props.dispatch(
              { type: "UPDATE_STYLE", nodeId: node.id, breakpoint: props.breakpoint, patch },
              { coalesceKey: `style:${node.id}:${props.breakpoint}:${keyForCoalesce}`, historyLabel: "Style" },
            )
          }
          onResetBreakpoint={() => {
            props.dispatch(
              { type: "RESET_STYLE_BREAKPOINT", nodeId: node.id, breakpoint: props.breakpoint },
              { historyLabel: "Reset styles" },
            );
          }}
        />
      ) : null}

      <details className={styles.issuesPanel} open={errorCount > 0}>
        <summary className={styles.issuesSummary}>
          Issues ({errorCount} errors, {warningCount} warnings)
        </summary>
        <div className={styles.issuesBody}>
          {props.issues.length === 0 ? (
            <div className={styles.muted}>No issues.</div>
          ) : (
            <ul className={styles.issueList}>
              {props.issues
                .slice()
                .sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1))
                .map((issue, idx) => {
                  const issueNode = props.doc.nodes[issue.nodeId];
                  const label = issueNode ? blockRegistry[issueNode.type].label : "Missing node";
                  return (
                    <li key={`${issue.nodeId}:${idx}`} className={styles.issueItem}>
                      <button
                        type="button"
                        className={styles.issueButton}
                        onClick={() => props.dispatch({ type: "SET_SELECTED", nodeId: issue.nodeId })}
                      >
                        <span className={issue.level === "error" ? styles.issueLevelError : styles.issueLevelWarning}>
                          {issue.level.toUpperCase()}
                        </span>
                        <span className={styles.issueText}>
                          <span className={styles.issueNode}>{label}</span>: {issue.message}
                          {issue.fieldPath ? <span className={styles.issuePath}> ({issue.fieldPath})</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function InspectorContent(props: {
  node: { id: NodeId; type: NodeType; props: Record<string, unknown> };
  disabled: boolean;
  nodeIssues: ValidationIssue[];
  onPatchProps: (patch: Record<string, unknown>, keyForCoalesce: string) => void;
  onResetProp: (propKey: string) => void;
}) {
  const schema = blockRegistry[props.node.type].inspector;
  if (!schema) return <p className={styles.muted}>No inspector schema defined.</p>;

  const groups = schema.groups;
  return (
    <div className={styles.inspectorSection} role="tabpanel" aria-label="Content">
      {groups.map((g) => (
        <div key={g.label} className={styles.group}>
          <div className={styles.groupHeader}>{g.label}</div>
          <div className={styles.groupBody}>
            {g.fields.map((field) => (
              <Fragment key={field.path}>
                <InspectorPropField
                  nodeProps={props.node.props}
                  field={field}
                  disabled={props.disabled}
                  issues={props.nodeIssues.filter((i) => i.fieldPath === field.path)}
                  onChange={(value) => {
                    const key = propKeyFromPath(field.path);
                    if (!key) return;
                    props.onPatchProps({ [key]: value }, key);
                  }}
                  onReset={() => {
                    const key = propKeyFromPath(field.path);
                    if (!key) return;
                    props.onResetProp(key);
                  }}
                />
              </Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorPropField(props: {
  nodeProps: Record<string, unknown>;
  field: {
    kind: "text" | "select" | "color" | "length" | "toggle";
    path: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: { label: string; value: string }[];
    tokens?: string[];
  };
  disabled: boolean;
  issues: ValidationIssue[];
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const key = propKeyFromPath(props.field.path);
  const rawValue = key ? props.nodeProps[key] : undefined;

  const common = {
    id: `field_${props.field.path}`,
    disabled: props.disabled,
    "aria-invalid": props.issues.some((i) => i.level === "error") || undefined,
  } as const;

  const resetDisabled = props.disabled || !key;

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <label className={styles.fieldLabel} htmlFor={common.id}>
          {props.field.label}
          {props.field.required ? <span className={styles.required}>*</span> : null}
        </label>
        <button type="button" className={styles.resetButton} disabled={resetDisabled} onClick={props.onReset}>
          Reset
        </button>
      </div>

      {props.field.kind === "toggle" ? (
        <label className={styles.toggleRow}>
          <input
            {...common}
            type="checkbox"
            checked={Boolean(rawValue)}
            onChange={(e) => props.onChange(e.target.checked)}
          />
          <span className={styles.toggleLabel}>Enabled</span>
        </label>
      ) : null}

      {props.field.kind === "select" ? (
        <select
          {...common}
          value={typeof rawValue === "string" ? rawValue : ""}
          onChange={(e) => props.onChange(e.target.value)}
        >
          {(props.field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}

      {props.field.kind === "text" ? (
        <input
          {...common}
          type={typeof rawValue === "number" ? "number" : "text"}
          value={rawValue === undefined || rawValue === null ? "" : String(rawValue)}
          placeholder={props.field.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : null}

      {props.field.kind === "length" ? (
        <TokenTextField
          {...common}
          value={typeof rawValue === "string" ? rawValue : ""}
          placeholder={props.field.placeholder}
          tokens={[...(props.field.tokens ?? []), ...getSpacingTokens().map((t) => t.value)]}
          onChange={(v) => props.onChange(v)}
        />
      ) : null}

      {props.field.kind === "color" ? (
        <TokenTextField
          {...common}
          value={typeof rawValue === "string" ? rawValue : ""}
          placeholder={props.field.placeholder}
          tokens={COLOR_TOKENS.map((t) => t.value)}
          onChange={(v) => props.onChange(v)}
        />
      ) : null}

      {props.issues.length > 0 ? (
        <div className={styles.fieldIssues} role="alert">
          {props.issues.map((i, idx) => (
            <div key={idx} className={i.level === "error" ? styles.issueError : styles.issueWarning}>
              {i.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InspectorStyle(props: {
  node: { id: NodeId; style?: unknown };
  disabled: boolean;
  nodeIssues: ValidationIssue[];
  breakpoint: Breakpoint;
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
  onResetBreakpoint: () => void;
}) {
  const node = props.node as unknown as { id: NodeId; style?: import("@/editor-core").Responsive<StyleProps> };
  const style = node.style;

  const bpBucket =
    props.breakpoint === "base" ? style?.base : style?.[props.breakpoint];

  const canResetBreakpoint =
    props.breakpoint === "base"
      ? Boolean(style && Object.keys(style.base ?? {}).length > 0)
      : Boolean(bpBucket && Object.keys(bpBucket).length > 0);

  return (
    <div className={styles.inspectorSection} role="tabpanel" aria-label="Style">
      <div className={styles.inlineRow}>
        <div className={styles.muted}>Editing: {props.breakpoint.toUpperCase()}</div>
        <button
          type="button"
          className={styles.resetButton}
          disabled={props.disabled || !canResetBreakpoint}
          onClick={props.onResetBreakpoint}
        >
          Reset breakpoint
        </button>
      </div>

      <StyleGroup
        label="Layout"
        fields={[
          { key: "display", label: "Display", kind: "select", options: ["", "block", "flex"] },
          { key: "flexDirection", label: "Direction", kind: "select", options: ["", "row", "column"] },
          { key: "justifyContent", label: "Justify", kind: "select", options: ["", "flex-start", "center", "flex-end", "space-between"] },
          { key: "alignItems", label: "Align", kind: "select", options: ["", "stretch", "flex-start", "center", "flex-end"] },
          { key: "gap", label: "Gap", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Box"
        fields={[
          { key: "padding", label: "Padding", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "margin", label: "Margin", kind: "length", tokens: getSpacingTokens().map((t) => t.value) },
          { key: "width", label: "Width", kind: "length" },
          { key: "maxWidth", label: "Max width", kind: "length" },
          { key: "minHeight", label: "Min height", kind: "length" },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Typography"
        fields={[
          { key: "fontFamily", label: "Font family", kind: "text", tokens: FONT_FAMILY_TOKENS.map((t) => t.value) },
          { key: "fontSize", label: "Font size", kind: "text", tokens: FONT_SIZE_TOKENS.map((t) => t.value) },
          { key: "fontWeight", label: "Font weight", kind: "text" },
          { key: "lineHeight", label: "Line height", kind: "text" },
          { key: "textAlign", label: "Align", kind: "select", options: ["", "left", "center", "right"] },
          { key: "color", label: "Text color", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />

      <StyleGroup
        label="Visual"
        fields={[
          { key: "backgroundColor", label: "Background", kind: "color", tokens: COLOR_TOKENS.map((t) => t.value) },
          { key: "borderRadius", label: "Radius", kind: "length" },
          { key: "border", label: "Border", kind: "text" },
          { key: "boxShadow", label: "Shadow", kind: "text" },
          { key: "opacity", label: "Opacity", kind: "number" },
        ]}
        nodeStyle={style}
        breakpoint={props.breakpoint}
        disabled={props.disabled}
        onPatchStyle={props.onPatchStyle}
      />
    </div>
  );
}

function StyleGroup(props: {
  label: string;
  fields: Array<
    | { key: keyof StyleProps; label: string; kind: "length" | "text" | "color"; tokens?: string[] }
    | { key: keyof StyleProps; label: string; kind: "select"; options: string[] }
    | { key: keyof StyleProps; label: string; kind: "number" }
  >;
  nodeStyle: import("@/editor-core").Responsive<StyleProps> | undefined;
  breakpoint: Breakpoint;
  disabled: boolean;
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
}) {
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader}>{props.label}</div>
      <div className={styles.groupBody}>
        {props.fields.map((f) => (
          <StyleField
            key={String(f.key)}
            nodeStyle={props.nodeStyle}
            breakpoint={props.breakpoint}
            disabled={props.disabled}
            field={f as never}
            onPatchStyle={props.onPatchStyle}
          />
        ))}
      </div>
    </div>
  );
}

function StyleField(props: {
  nodeStyle: import("@/editor-core").Responsive<StyleProps> | undefined;
  breakpoint: Breakpoint;
  disabled: boolean;
  field:
    | { key: keyof StyleProps; label: string; kind: "length" | "text" | "color"; tokens?: string[] }
    | { key: keyof StyleProps; label: string; kind: "select"; options: string[] }
    | { key: keyof StyleProps; label: string; kind: "number" };
  onPatchStyle: (patch: Partial<StyleProps>, keyForCoalesce: string) => void;
}) {
  const style = props.nodeStyle;
  const key = props.field.key;

  const overridden = isStyleKeyOverridden(style, props.breakpoint, key);
  const effective = getEffectiveStyleValue(style, props.breakpoint, key);
  const inherited = getInheritedStyleValue(style, props.breakpoint, key);

  const bucket =
    props.breakpoint === "base" ? style?.base : style?.[props.breakpoint];

  const bucketValue = bucket ? (bucket as Record<string, unknown>)[key as string] : undefined;

  const resetDisabled = props.disabled || !overridden;

  const inheritedText = inherited === undefined ? "" : String(inherited);

  const fieldId = `style_${props.breakpoint}_${String(key)}`;

  const onReset = () => {
    props.onPatchStyle({ [key]: undefined } as Partial<StyleProps>, String(key));
  };

  const onChangeText = (value: string) => {
    props.onPatchStyle({ [key]: value.trim() ? value : undefined } as Partial<StyleProps>, String(key));
  };

  const onChangeNumber = (value: string) => {
    if (!value.trim()) {
      props.onPatchStyle({ [key]: undefined } as Partial<StyleProps>, String(key));
      return;
    }
    const num = Number(value);
    props.onPatchStyle({ [key]: Number.isFinite(num) ? num : undefined } as Partial<StyleProps>, String(key));
  };

  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldHeader}>
        <div className={styles.fieldLabelRow}>
          <span className={styles.fieldLabel}>{props.field.label}</span>
          {overridden ? <span className={styles.badgeSmall}>Override</span> : inheritedText ? <span className={styles.badgeSmall}>Inherited</span> : null}
        </div>
        <button type="button" className={styles.resetButton} disabled={resetDisabled} onClick={onReset}>
          Reset
        </button>
      </div>

      {props.field.kind === "select" ? (
        <select
          disabled={props.disabled}
          value={typeof effective === "string" ? effective : ""}
          onChange={(e) => {
            const v = e.target.value;
            props.onPatchStyle({ [key]: v ? v : undefined } as Partial<StyleProps>, String(key));
          }}
        >
          {props.field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt || "Unset"}
            </option>
          ))}
        </select>
      ) : null}

      {props.field.kind === "number" ? (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={1}
          step={0.05}
          disabled={props.disabled}
          value={bucketValue === undefined || bucketValue === null ? "" : String(bucketValue)}
          placeholder={typeof effective === "number" ? String(effective) : ""}
          onChange={(e) => onChangeNumber(e.target.value)}
        />
      ) : null}

      {props.field.kind === "text" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={bucketValue === undefined || bucketValue === null ? "" : String(bucketValue)}
          placeholder={typeof effective === "string" ? String(effective) : ""}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {props.field.kind === "length" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={typeof bucketValue === "string" ? bucketValue : ""}
          placeholder={typeof effective === "string" ? String(effective) : inheritedText}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {props.field.kind === "color" ? (
        <TokenTextField
          id={fieldId}
          disabled={props.disabled}
          value={typeof bucketValue === "string" ? bucketValue : ""}
          placeholder={typeof effective === "string" ? String(effective) : inheritedText}
          tokens={"tokens" in props.field ? props.field.tokens : undefined}
          onChange={onChangeText}
        />
      ) : null}

      {!overridden && inheritedText ? <div className={styles.fieldHelp}>Inherited: {inheritedText}</div> : null}
    </div>
  );
}

function TokenTextField(props: {
  id?: string;
  disabled?: boolean;
  value: string;
  placeholder?: string;
  tokens?: string[];
  onChange: (value: string) => void;
  "aria-invalid"?: boolean | undefined;
}) {
  const datalistId = props.tokens?.length ? `${props.id ?? "token"}_tokens` : undefined;

  return (
    <div className={styles.tokenField}>
      {props.tokens?.length ? (
        <select
          className={styles.tokenSelect}
          disabled={props.disabled}
          value=""
          aria-label="Tokens"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            props.onChange(v);
          }}
        >
          <option value="">Tokens</option>
          {props.tokens.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}

      <input
        id={props.id}
        className={styles.tokenInput}
        disabled={props.disabled}
        value={props.value}
        placeholder={props.placeholder}
        list={datalistId}
        aria-invalid={props["aria-invalid"]}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
      />

      {datalistId ? (
        <datalist id={datalistId}>
          {props.tokens?.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function propKeyFromPath(path: string): string | null {
  if (!path.startsWith("props.")) return null;
  const key = path.slice("props.".length);
  if (!key) return null;
  if (key.includes(".")) return null;
  return key;
}

function buildPaletteSubtree(nodeType: NodeType, idFactory: IdFactory): Subtree {
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

function findInsertTarget(
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

function describeNodeForA11y(doc: Document, nodeId: NodeId): string {
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

function buildSelectionBreadcrumb(doc: Document, selectedId: NodeId | null): string {
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

function sanitizeFilename(input: string): string {
  const trimmed = input.trim() || "page";
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}




type DropIndicatorGeometry = {
  kind: "line" | "placeholder";
  axis: "x" | "y";
  parentId: NodeId;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

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
