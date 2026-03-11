import { applyPatches, enablePatches, type Patch, produceWithPatches } from "immer";
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";

import {
  applyDocCommandToDraft,
  cloneSubtree,
  computeNextSelectionAfterDelete,
  createDefaultDocument,
  createNanoidFactory,
  findDefaultPasteTarget,
  remapIds,
  validateDocument,
  type Breakpoint,
  type DocCommand,
  type Document,
  type IdFactory,
  type NodeId,
  type Subtree,
  type ValidationIssue,
} from "@/editor-core";

enablePatches();

export type Mode = "edit" | "preview";

export type HistoryEntry = {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  at: number;
  coalesceKey?: string;
};

type ActiveTransaction = {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  at: number;
};

export type ClipboardState = Subtree[] | null;

export type UiCommand =
  | { type: "SET_SELECTED"; nodeId: NodeId | null }
  | { type: "SHIFT_SELECT"; nodeId: NodeId }
  | { type: "SELECT_SIBLINGS" }
  | { type: "SET_HOVERED"; nodeId: NodeId | null }
  | { type: "SET_MODE"; mode: Mode }
  | { type: "SET_BREAKPOINT"; breakpoint: Breakpoint };

export type EditorAction = DocCommand | UiCommand;

export type DispatchOptions = {
  historyLabel?: string;
  coalesceKey?: string;
  coalesceWindowMs?: number; // default 500ms
};

export type EditorState = {
  doc: Document;
  issues: ValidationIssue[];

  mode: Mode;
  breakpoint: Breakpoint;
  /** Primary selected node (anchor). For single-select workflows this is the sole selection. */
  selectedId: NodeId | null;
  /** All currently selected node IDs (always includes selectedId when non-null). */
  selectedIds: NodeId[];
  hoveredId: NodeId | null;

  idFactory: IdFactory;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  activeTxn: ActiveTransaction | null;

  clipboard: ClipboardState;

  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
  undo: () => void;
  redo: () => void;

  replaceDocument: (doc: Document) => void;

  beginTransaction: (label: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;

  copySelected: () => { ok: true } | { ok: false; error: string };
  cutSelected: () => { ok: true } | { ok: false; error: string };
  paste: () => { ok: true; insertedRootId: NodeId } | { ok: false; error: string };

  deleteSelected: () => { ok: true } | { ok: false; error: string };
  duplicateSelected: () => { ok: true } | { ok: false; error: string };
};

export type CreateEditorStoreOptions = {
  doc?: Document;
  mode?: Mode;
  breakpoint?: Breakpoint;
  selectedId?: NodeId | null;
  idFactory?: IdFactory;
};

type ApplyCtxLike = {
  idFactory: IdFactory;
  issues: ValidationIssue[];
  createdNodeId?: NodeId;
  deletedNodeIds?: NodeId[];
};

function isUiCommand(action: EditorAction): action is UiCommand {
  return (
    action.type === "SET_SELECTED" ||
    action.type === "SHIFT_SELECT" ||
    action.type === "SELECT_SIBLINGS" ||
    action.type === "SET_HOVERED" ||
    action.type === "SET_MODE" ||
    action.type === "SET_BREAKPOINT"
  );
}

function defaultHistoryLabel(action: DocCommand): string {
  switch (action.type) {
    case "ADD_NODE":
      return `Add ${action.nodeType}`;
    case "MOVE_NODE":
      return "Move";
    case "DELETE_NODE":
      return "Delete";
    case "DUPLICATE_NODE":
      return "Duplicate";
    case "UPDATE_META":
      return "Document";
    case "UPDATE_PROPS":
      return "Edit";
    case "UPDATE_STYLE":
      return "Style";
    case "RESET_STYLE_BREAKPOINT":
      return "Reset styles";
    case "SET_COLUMNS":
      return "Set columns";
    case "INSERT_SUBTREE":
      return "Insert";
    case "UPDATE_THEME":
      return "Update theme";
    case "UPDATE_CONSTRAINTS":
      return "Constraints";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function ensureValidSelection(doc: Document, selectedId: NodeId | null): NodeId | null {
  if (!selectedId) return doc.rootId;
  return doc.nodes[selectedId] ? selectedId : doc.rootId;
}

function mergeHistory(
  prev: HistoryEntry,
  next: { patches: Patch[]; inversePatches: Patch[]; at: number },
): HistoryEntry {
  return {
    ...prev,
    patches: [...prev.patches, ...next.patches],
    inversePatches: [...next.inversePatches, ...prev.inversePatches],
    at: next.at,
  };
}

function isCoalesceCompatible(prev: HistoryEntry | undefined, key: string, now: number, windowMs: number): boolean {
  if (!prev) return false;
  if (prev.coalesceKey !== key) return false;
  return now - prev.at <= windowMs;
}

/** Returns the depth of a node (root = 0). */
function nodeDepth(doc: Document, nodeId: NodeId): number {
  let depth = 0;
  let current: NodeId | undefined = nodeId;
  while (current && doc.nodes[current]?.parentId) {
    current = doc.nodes[current]!.parentId ?? undefined;
    depth++;
  }
  return depth;
}

/** Sort node IDs so deeper nodes come first (for safe multi-delete). */
function sortByReverseTreeOrder(doc: Document, nodeIds: NodeId[]): NodeId[] {
  return [...nodeIds].sort((a, b) => nodeDepth(doc, b) - nodeDepth(doc, a));
}

export function createEditorStore(opts: CreateEditorStoreOptions = {}) {
  const initialDoc = opts.doc ?? createDefaultDocument();
  const initialIssues = validateDocument(initialDoc);

  const idFactory = opts.idFactory ?? createNanoidFactory();
  const initialSelectedId = opts.selectedId ?? initialDoc.rootId;

  return createStore<EditorState>()(
    subscribeWithSelector((set, get) => ({
      doc: initialDoc,
      issues: initialIssues,

      mode: opts.mode ?? "edit",
      breakpoint: opts.breakpoint ?? "lg",
      selectedId: initialSelectedId,
      selectedIds: initialSelectedId ? [initialSelectedId] : [],
      hoveredId: null,

      idFactory,

      undoStack: [],
      redoStack: [],
      activeTxn: null,

      clipboard: null,

      dispatch: (action, dispatchOpts) => {
        if (isUiCommand(action)) {
          switch (action.type) {
            case "SET_SELECTED": {
              const resolved = ensureValidSelection(get().doc, action.nodeId);
              set({ selectedId: resolved, selectedIds: resolved ? [resolved] : [] });
              return;
            }
            case "SHIFT_SELECT": {
              const state = get();
              const { nodeId } = action;
              if (!state.doc.nodes[nodeId]) return;

              const current = new Set(state.selectedIds);
              if (current.has(nodeId)) {
                // Remove from selection
                current.delete(nodeId);
                const remaining = [...current];
                if (remaining.length === 0) {
                  // Nothing left — select root
                  const root = state.doc.rootId;
                  set({ selectedId: root, selectedIds: [root] });
                } else {
                  // If removed node was primary, promote first remaining
                  const newPrimary = state.selectedId === nodeId ? remaining[0] : state.selectedId;
                  set({ selectedId: newPrimary ?? remaining[0], selectedIds: remaining });
                }
              } else {
                // Add to selection; make it primary
                current.add(nodeId);
                set({ selectedId: nodeId, selectedIds: [...current] });
              }
              return;
            }
            case "SELECT_SIBLINGS": {
              const state = get();
              const primaryId = state.selectedId;
              if (!primaryId) return;
              const node = state.doc.nodes[primaryId];
              if (!node || !node.parentId) return;
              const parent = state.doc.nodes[node.parentId];
              if (!parent) return;
              const siblings = parent.children;
              if (siblings.length === 0) return;
              set({ selectedId: primaryId, selectedIds: [...siblings] });
              return;
            }
            case "SET_HOVERED":
              set({ hoveredId: action.nodeId });
              return;
            case "SET_MODE":
              set({ mode: action.mode });
              return;
            case "SET_BREAKPOINT":
              set({ breakpoint: action.breakpoint });
              return;
          }
        }

        const state = get();
        const now = Date.now();
        const label = dispatchOpts?.historyLabel ?? defaultHistoryLabel(action);
        const coalesceKey = dispatchOpts?.coalesceKey;
        const coalesceWindowMs = dispatchOpts?.coalesceWindowMs ?? 500;

        const preDeleteSelection =
          action.type === "DELETE_NODE" ? computeNextSelectionAfterDelete(state.doc, action.nodeId) : null;

        const commandIssues: ValidationIssue[] = [];
        const ctx: ApplyCtxLike = { idFactory: state.idFactory, issues: commandIssues };

        const [nextDoc, patches, inversePatches] = produceWithPatches(state.doc, (draft) => {
          applyDocCommandToDraft(draft, action, ctx);
        });

        const changed = patches.length > 0;
        const nextIssues = dedupeIssues([...commandIssues, ...validateDocument(nextDoc)]);

        // Always update doc + issues, even for a no-op, because commandIssues may have been added.
        const partial: Partial<EditorState> = {
          doc: nextDoc,
          issues: nextIssues,
        };

        if (changed) {
          partial.redoStack = [];

          if (state.activeTxn) {
            partial.activeTxn = {
              ...state.activeTxn,
              patches: [...state.activeTxn.patches, ...patches],
              inversePatches: [...inversePatches, ...state.activeTxn.inversePatches],
            };
          } else {
            const entry: HistoryEntry = {
              label,
              patches,
              inversePatches,
              at: now,
              coalesceKey,
            };

            const prevUndo = state.undoStack[state.undoStack.length - 1];
            if (coalesceKey && isCoalesceCompatible(prevUndo, coalesceKey, now, coalesceWindowMs)) {
              const merged = mergeHistory(prevUndo, { patches, inversePatches, at: now });
              partial.undoStack = [...state.undoStack.slice(0, -1), merged];
            } else {
              partial.undoStack = [...state.undoStack, entry];
            }
          }
        }

        // Centralized selection semantics (do not record in history).
        if (changed) {
          switch (action.type) {
            case "ADD_NODE":
            case "DUPLICATE_NODE":
            case "INSERT_SUBTREE": {
              const newId = ensureValidSelection(nextDoc, ctx.createdNodeId ?? null);
              partial.selectedId = newId;
              partial.selectedIds = newId ? [newId] : [];
              break;
            }
            case "MOVE_NODE": {
              const movedId = ensureValidSelection(nextDoc, action.nodeId);
              partial.selectedId = movedId;
              partial.selectedIds = movedId ? [movedId] : [];
              break;
            }
            case "DELETE_NODE": {
              const nextId = ensureValidSelection(nextDoc, preDeleteSelection);
              partial.selectedId = nextId;
              // Remove deleted node from selectedIds, keeping others that still exist
              partial.selectedIds = state.selectedIds
                .filter((id) => id !== action.nodeId && nextDoc.nodes[id])
                .concat(nextId && !state.selectedIds.includes(nextId) && state.selectedIds.includes(action.nodeId) ? [nextId] : []);
              if ((partial.selectedIds as NodeId[]).length === 0 && nextId) {
                partial.selectedIds = [nextId];
              }
              break;
            }
            case "UPDATE_META":
            case "UPDATE_PROPS":
            case "UPDATE_STYLE":
            case "SET_COLUMNS":
            case "UPDATE_THEME": {
              const stayId = ensureValidSelection(nextDoc, state.selectedId);
              partial.selectedId = stayId;
              partial.selectedIds = state.selectedIds.filter((id) => nextDoc.nodes[id]);
              if ((partial.selectedIds as NodeId[]).length === 0 && stayId) {
                partial.selectedIds = [stayId];
              }
              break;
            }
          }
        } else {
          const stayId = ensureValidSelection(nextDoc, state.selectedId);
          partial.selectedId = stayId;
          partial.selectedIds = state.selectedIds.filter((id) => nextDoc.nodes[id]);
          if ((partial.selectedIds as NodeId[]).length === 0 && stayId) {
            partial.selectedIds = [stayId];
          }
        }

        set(partial as EditorState);
      },

      undo: () => {
        const state = get();
        if (state.activeTxn) return;
        const entry = state.undoStack[state.undoStack.length - 1];
        if (!entry) return;

        const nextDoc = applyPatches(state.doc, entry.inversePatches);
        const nextIssues = validateDocument(nextDoc);
        const stayId = ensureValidSelection(nextDoc, state.selectedId);

        set({
          doc: nextDoc,
          issues: nextIssues,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, entry],
          selectedId: stayId,
          selectedIds: stayId ? [stayId] : [],
        });
      },

      redo: () => {
        const state = get();
        if (state.activeTxn) return;
        const entry = state.redoStack[state.redoStack.length - 1];
        if (!entry) return;

        const nextDoc = applyPatches(state.doc, entry.patches);
        const nextIssues = validateDocument(nextDoc);
        const stayId = ensureValidSelection(nextDoc, state.selectedId);

        set({
          doc: nextDoc,
          issues: nextIssues,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, entry],
          selectedId: stayId,
          selectedIds: stayId ? [stayId] : [],
        });
      },

      replaceDocument: (nextDoc) => {
        const nextIssues = validateDocument(nextDoc);
        set({
          doc: nextDoc,
          issues: nextIssues,
          selectedId: nextDoc.rootId,
          selectedIds: [nextDoc.rootId],
          hoveredId: null,
          undoStack: [],
          redoStack: [],
          activeTxn: null,
          clipboard: null,
        });
      },

      beginTransaction: (label) => {
        const state = get();
        if (state.activeTxn) return;
        set({
          activeTxn: { label, patches: [], inversePatches: [], at: Date.now() },
          redoStack: [],
        });
      },

      commitTransaction: () => {
        const state = get();
        const txn = state.activeTxn;
        if (!txn) return;

        if (txn.patches.length === 0) {
          set({ activeTxn: null });
          return;
        }

        const entry: HistoryEntry = {
          label: txn.label,
          patches: txn.patches,
          inversePatches: txn.inversePatches,
          at: txn.at,
        };

        set({
          activeTxn: null,
          undoStack: [...state.undoStack, entry],
          redoStack: [],
        });
      },

      cancelTransaction: () => {
        const state = get();
        if (!state.activeTxn) return;
        set({ activeTxn: null });
      },

      copySelected: () => {
        const state = get();
        const ids = state.selectedIds.filter(
          (id) => id !== state.doc.rootId && state.doc.nodes[id],
        );
        if (ids.length === 0) {
          if (state.selectedId === state.doc.rootId) return { ok: false, error: "Cannot copy the root Page node." };
          return { ok: false, error: "Nothing selected." };
        }

        const subtrees = ids.map((id) => cloneSubtree(state.doc, id));
        set({ clipboard: subtrees });
        return { ok: true };
      },

      cutSelected: () => {
        const state = get();
        const ids = state.selectedIds.filter(
          (id) => id !== state.doc.rootId && state.doc.nodes[id],
        );
        if (ids.length === 0) {
          if (state.selectedId === state.doc.rootId) return { ok: false, error: "Cannot cut the root Page node." };
          return { ok: false, error: "Nothing selected." };
        }

        const copyRes = get().copySelected();
        if (!copyRes.ok) return copyRes;

        get().beginTransaction("Cut");
        const sorted = sortByReverseTreeOrder(get().doc, ids);
        for (const nodeId of sorted) {
          if (get().doc.nodes[nodeId]) {
            get().dispatch({ type: "DELETE_NODE", nodeId });
          }
        }
        get().commitTransaction();

        // Don't override selectedId — DELETE_NODE already computed the right next selection.
        const currentId = get().selectedId ?? get().doc.rootId;
        set({ selectedIds: [currentId] });
        return { ok: true };
      },

      paste: () => {
        const state = get();
        const clipboard = state.clipboard;
        if (!clipboard || clipboard.length === 0) return { ok: false, error: "Clipboard is empty." };

        const firstClipboardRoot = clipboard[0].nodes[clipboard[0].rootId];
        if (!firstClipboardRoot) return { ok: false, error: "Clipboard subtree is invalid." };

        const target = findDefaultPasteTarget(state.doc, state.selectedId, firstClipboardRoot.type);
        if (!target) return { ok: false, error: "No valid paste target for the selected node." };

        get().beginTransaction("Paste");
        let lastInsertedId: NodeId | null = null;
        let insertIndex = target.index;
        for (const subtree of clipboard) {
          const remapped = remapIds(subtree, state.idFactory);
          get().dispatch({ type: "INSERT_SUBTREE", parentId: target.parentId, index: insertIndex, subtree: remapped });
          if (get().doc.nodes[remapped.rootId]) {
            lastInsertedId = remapped.rootId;
            insertIndex++;
          }
        }
        get().commitTransaction();

        const insertedRootId = lastInsertedId ?? clipboard[0].rootId;
        if (!get().doc.nodes[insertedRootId]) {
          return { ok: false, error: "Paste failed due to structural constraints." };
        }

        set({ selectedId: insertedRootId, selectedIds: [insertedRootId] });
        return { ok: true, insertedRootId };
      },

      deleteSelected: () => {
        const state = get();
        const ids = state.selectedIds.filter(
          (id) => id !== state.doc.rootId && state.doc.nodes[id],
        );
        if (ids.length === 0) {
          if (state.selectedId === state.doc.rootId) return { ok: false, error: "Cannot delete the root Page node." };
          return { ok: false, error: "Nothing selected." };
        }

        if (ids.length === 1) {
          get().dispatch({ type: "DELETE_NODE", nodeId: ids[0] }, { historyLabel: "Delete" });
          const root = get().doc.rootId;
          // selectedId was already updated by dispatch; just clear selectedIds to single
          const current = get().selectedId ?? root;
          set({ selectedIds: [current] });
          return { ok: true };
        }

        const sorted = sortByReverseTreeOrder(get().doc, ids);
        get().beginTransaction(`Delete ${ids.length} nodes`);
        for (const nodeId of sorted) {
          if (get().doc.nodes[nodeId]) {
            get().dispatch({ type: "DELETE_NODE", nodeId });
          }
        }
        get().commitTransaction();

        const currentId = get().selectedId ?? get().doc.rootId;
        set({ selectedIds: [currentId] });
        return { ok: true };
      },

      duplicateSelected: () => {
        const state = get();
        const ids = state.selectedIds.filter(
          (id) => id !== state.doc.rootId && state.doc.nodes[id],
        );
        if (ids.length === 0) {
          if (state.selectedId === state.doc.rootId) return { ok: false, error: "Cannot duplicate the root Page node." };
          return { ok: false, error: "Nothing selected." };
        }

        if (ids.length === 1) {
          get().dispatch({ type: "DUPLICATE_NODE", nodeId: ids[0] }, { historyLabel: "Duplicate" });
          const newId = get().selectedId;
          set({ selectedIds: newId ? [newId] : [] });
          return { ok: true };
        }

        const createdIds: NodeId[] = [];
        const ctx: ApplyCtxLike = { idFactory: state.idFactory, issues: [] };

        get().beginTransaction(`Duplicate ${ids.length} nodes`);
        for (const nodeId of ids) {
          if (get().doc.nodes[nodeId]) {
            get().dispatch({ type: "DUPLICATE_NODE", nodeId });
            const newId = get().selectedId;
            if (newId && !ids.includes(newId)) createdIds.push(newId);
          }
        }
        get().commitTransaction();

        if (createdIds.length > 0) {
          const lastId = createdIds[createdIds.length - 1];
          set({ selectedId: lastId, selectedIds: createdIds });
        }
        return { ok: true };
      },
    })),
  );
}

export type EditorStore = ReturnType<typeof createEditorStore>;

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

// Default singleton store for the app shell. Use createEditorStore() for embedded instances.
export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
