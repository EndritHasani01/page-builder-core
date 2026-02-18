import { applyPatches, enablePatches, type Patch, produceWithPatches } from "immer";
import { createStore, type StoreApi } from "zustand/vanilla";
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

export type ClipboardState = Subtree | null;

export type UiCommand =
  | { type: "SET_SELECTED"; nodeId: NodeId | null }
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
  selectedId: NodeId | null;
  hoveredId: NodeId | null;

  idFactory: IdFactory;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  activeTxn: ActiveTransaction | null;

  clipboard: ClipboardState;

  dispatch: (action: EditorAction, opts?: DispatchOptions) => void;
  undo: () => void;
  redo: () => void;

  beginTransaction: (label: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;

  copySelected: () => { ok: true } | { ok: false; error: string };
  cutSelected: () => { ok: true } | { ok: false; error: string };
  paste: () => { ok: true; insertedRootId: NodeId } | { ok: false; error: string };
};

export type CreateEditorStoreOptions = {
  doc?: Document;
  mode?: Mode;
  breakpoint?: Breakpoint;
  selectedId?: NodeId | null;
  idFactory?: IdFactory;
};

export type EditorStore = StoreApi<EditorState>;

type ApplyCtxLike = {
  idFactory: IdFactory;
  issues: ValidationIssue[];
  createdNodeId?: NodeId;
  deletedNodeIds?: NodeId[];
};

function isUiCommand(action: EditorAction): action is UiCommand {
  return (
    action.type === "SET_SELECTED" ||
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

export function createEditorStore(opts: CreateEditorStoreOptions = {}): EditorStore {
  const initialDoc = opts.doc ?? createDefaultDocument();
  const initialIssues = validateDocument(initialDoc);

  const idFactory = opts.idFactory ?? createNanoidFactory();

  return createStore<EditorState>()(
    subscribeWithSelector((set, get) => ({
      doc: initialDoc,
      issues: initialIssues,

      mode: opts.mode ?? "edit",
      breakpoint: opts.breakpoint ?? "lg",
      selectedId: opts.selectedId ?? initialDoc.rootId,
      hoveredId: null,

      idFactory,

      undoStack: [],
      redoStack: [],
      activeTxn: null,

      clipboard: null,

      dispatch: (action, dispatchOpts) => {
        if (isUiCommand(action)) {
          switch (action.type) {
            case "SET_SELECTED":
              set({ selectedId: ensureValidSelection(get().doc, action.nodeId) });
              return;
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
            case "INSERT_SUBTREE":
              partial.selectedId = ensureValidSelection(nextDoc, ctx.createdNodeId ?? null);
              break;
            case "MOVE_NODE":
              partial.selectedId = ensureValidSelection(nextDoc, action.nodeId);
              break;
            case "DELETE_NODE":
              partial.selectedId = ensureValidSelection(nextDoc, preDeleteSelection);
              break;
            case "UPDATE_PROPS":
            case "UPDATE_STYLE":
            case "SET_COLUMNS":
              partial.selectedId = ensureValidSelection(nextDoc, state.selectedId);
              break;
          }
        } else {
          partial.selectedId = ensureValidSelection(nextDoc, state.selectedId);
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

        set({
          doc: nextDoc,
          issues: nextIssues,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, entry],
          selectedId: ensureValidSelection(nextDoc, state.selectedId),
        });
      },

      redo: () => {
        const state = get();
        if (state.activeTxn) return;
        const entry = state.redoStack[state.redoStack.length - 1];
        if (!entry) return;

        const nextDoc = applyPatches(state.doc, entry.patches);
        const nextIssues = validateDocument(nextDoc);

        set({
          doc: nextDoc,
          issues: nextIssues,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, entry],
          selectedId: ensureValidSelection(nextDoc, state.selectedId),
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
        const selectedId = state.selectedId;
        if (!selectedId) return { ok: false, error: "Nothing selected." };
        if (selectedId === state.doc.rootId) return { ok: false, error: "Cannot copy the root Page node." };
        if (!state.doc.nodes[selectedId]) return { ok: false, error: "Selected node does not exist." };

        const subtree = cloneSubtree(state.doc, selectedId);
        set({ clipboard: subtree });
        return { ok: true };
      },

      cutSelected: () => {
        const state = get();
        const selectedId = state.selectedId;
        if (!selectedId) return { ok: false, error: "Nothing selected." };
        if (selectedId === state.doc.rootId) return { ok: false, error: "Cannot cut the root Page node." };

        const copyRes = get().copySelected();
        if (!copyRes.ok) return copyRes;

        get().beginTransaction("Cut");
        get().dispatch({ type: "DELETE_NODE", nodeId: selectedId });
        get().commitTransaction();
        return { ok: true };
      },

      paste: () => {
        const state = get();
        const clipboard = state.clipboard;
        if (!clipboard) return { ok: false, error: "Clipboard is empty." };

        const clipboardRoot = clipboard.nodes[clipboard.rootId];
        if (!clipboardRoot) return { ok: false, error: "Clipboard subtree is invalid." };

        const remapped = remapIds(clipboard, state.idFactory);
        const target = findDefaultPasteTarget(state.doc, state.selectedId, clipboardRoot.type);
        if (!target) return { ok: false, error: "No valid paste target for the selected node." };

        get().beginTransaction("Paste");
        get().dispatch({ type: "INSERT_SUBTREE", parentId: target.parentId, index: target.index, subtree: remapped });
        get().commitTransaction();

        const insertedRootId = remapped.rootId;
        if (!get().doc.nodes[insertedRootId]) {
          return { ok: false, error: "Paste failed due to structural constraints." };
        }

        return { ok: true, insertedRootId };
      },
    })),
  );
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

// Default singleton store for the app shell. Use createEditorStore() for embedded instances.
export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
