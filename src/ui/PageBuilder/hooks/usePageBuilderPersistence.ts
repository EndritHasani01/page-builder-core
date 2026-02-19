import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { createDefaultDocument } from "@/editor-core";
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
  saveWorkspaceDocument,
  setActiveWorkspaceDocId,
  startAutosave,
} from "@/persistence";
import { editorStore } from "@/store";

export type RecoveryInfo = {
  code: ParseDocumentErrorCode;
  error: string;
  rawPrimary?: string;
  rawBackup?: string;
};

export type PageBuilderPersistenceApi = {
  docId: string;
  workspaceDocs: WorkspaceDocMeta[];
  persistence: PersistenceStatus;
  autosaveEnabled: boolean;
  recovery: RecoveryInfo | null;
  recoveryOpen: boolean;
  activateDocId: (nextDocId: string) => void;
  refreshWorkspaceDocs: () => void;
  stopAutosaveController: () => void;
  flushAutosaveIfEnabled: () => void;
  flushAutosaveNow: () => void;
  resetAutosaveQuotaBlock: () => void;
  isAutosaveQuotaBlocked: () => boolean;
  setAutosaveEnabled: Dispatch<SetStateAction<boolean>>;
  setRecovery: Dispatch<SetStateAction<RecoveryInfo | null>>;
  setRecoveryOpen: Dispatch<SetStateAction<boolean>>;
  setDocId: Dispatch<SetStateAction<string>>;
  confirmProceedIfQuotaBlocked: (actionLabel: string) => boolean;
  createNewDocument: () => { ok: true } | { ok: false; error: string };
  duplicateCurrentDocument: () => { ok: true } | { ok: false; error: string };
  deleteCurrentDocument: () => { ok: true } | { ok: false; error: string };
  clearSavedAfterQuota: (targetDocId: string) => { ok: true } | { ok: false; error: string };
  resetCurrentDocument: () => { ok: true } | { ok: false; error: string };
  overwriteSavedAndEnableAutosave: () => { ok: true } | { ok: false; error: string };
  loadBackupSnapshotForRecovery: () => { ok: true } | { ok: false; error: string };
  renameCurrentDocument: (title: string) => { ok: true } | { ok: false; error: string };
};

export function usePageBuilderPersistence(args: {
  pushToast: (kind: "info" | "error", message: string) => void;
}): PageBuilderPersistenceApi {
  const { pushToast } = args;

  const [workspaceDocs, setWorkspaceDocs] = useState<WorkspaceDocMeta[]>(() => listWorkspaceDocuments());
  const [docId, setDocId] = useState<string>(() => {
    const active = getActiveWorkspaceDocId();
    if (active) return active;
    const docs = listWorkspaceDocuments();
    if (docs.length > 0) return docs[0]!.id;
    return "default";
  });

  const [persistence, setPersistence] = useState<PersistenceStatus>({ state: "idle" });
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const autosaveRef = useRef<AutosaveController | null>(null);

  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const refreshWorkspaceDocs = useCallback(() => {
    setWorkspaceDocs(listWorkspaceDocuments());
  }, []);

  const stopAutosaveController = useCallback(() => {
    const ctrl = autosaveRef.current;
    if (ctrl) ctrl.stop();
    autosaveRef.current = null;
  }, []);

  const flushAutosaveIfEnabled = useCallback(() => {
    const ctrl = autosaveRef.current;
    if (!ctrl) return;
    if (!autosaveEnabled) return;
    if (ctrl.isQuotaBlocked()) return;
    ctrl.flush();
  }, [autosaveEnabled]);

  const flushAutosaveNow = useCallback(() => {
    autosaveRef.current?.flush();
  }, []);

  const resetAutosaveQuotaBlock = useCallback(() => {
    autosaveRef.current?.resetQuotaBlock();
  }, []);

  const isAutosaveQuotaBlocked = useCallback(() => {
    return autosaveRef.current?.isQuotaBlocked() ?? false;
  }, []);

  const activateLoadedDocument = useCallback(
    (nextDocId: string, nextDoc: ReturnType<typeof editorStore.getState>["doc"]) => {
      stopAutosaveController();
      editorStore.getState().replaceDocument(nextDoc);
      setDocId(nextDocId);
      setActiveWorkspaceDocId(nextDocId);
      setRecovery(null);
      setRecoveryOpen(false);
      setAutosaveEnabled(true);
      setPersistence({ state: "saved", at: Date.now() });
      refreshWorkspaceDocs();
    },
    [refreshWorkspaceDocs, stopAutosaveController],
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
        editorStore.getState().replaceDocument(createDefaultDocument());
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
    [activateLoadedDocument, pushToast, refreshWorkspaceDocs, stopAutosaveController],
  );

  const initialDocIdRef = useRef(docId);
  useEffect(() => {
    activateDocId(initialDocIdRef.current);
  }, [activateDocId]);

  const onAutosaveStatus = useCallback(
    (status: PersistenceStatus) => {
      setPersistence(status);
      if (status.state === "saved") {
        refreshWorkspaceDocs();
      }
    },
    [refreshWorkspaceDocs],
  );

  useEffect(() => {
    const ctrl = startAutosave(editorStore, docId, { onStatus: onAutosaveStatus, shouldSave: () => autosaveEnabled });
    autosaveRef.current = ctrl;
    return () => {
      autosaveRef.current = null;
      ctrl.stop();
    };
  }, [autosaveEnabled, docId, onAutosaveStatus]);

  const lastPersistenceError = useRef<string | null>(null);
  useEffect(() => {
    if (persistence.state !== "error") return;
    if (persistence.error === lastPersistenceError.current) return;
    lastPersistenceError.current = persistence.error;
    window.setTimeout(() => pushToast("error", persistence.error), 0);
  }, [persistence, pushToast]);

  const confirmProceedIfQuotaBlocked = useCallback(
    (actionLabel: string): boolean => {
      if (persistence.state !== "error" || !persistence.quota) return true;
      return window.confirm(
        `LocalStorage is full and autosave is paused.\n\n${actionLabel} may discard unsaved changes in the current document.\n\nExport JSON, then clear saved data to resume saving.\n\nContinue?`,
      );
    },
    [persistence],
  );

  const createNewDocument = useCallback((): { ok: true } | { ok: false; error: string } => {
    const state = editorStore.getState();
    if (state.activeTxn) return { ok: false, error: "Cannot create a new document during an active transaction." };
    if (!confirmProceedIfQuotaBlocked("Creating a new document")) return { ok: false, error: "Cancelled." };

    flushAutosaveIfEnabled();

    const created = createWorkspaceDocument();
    if (!created.ok) {
      setPersistence({ state: "error", error: created.error, quota: created.quota });
      pushToast("error", created.error);
      return { ok: false, error: created.error };
    }

    activateLoadedDocument(created.docId, created.doc);
    pushToast("info", "Created a new document.");
    return { ok: true };
  }, [activateLoadedDocument, confirmProceedIfQuotaBlocked, flushAutosaveIfEnabled, pushToast]);

  const duplicateCurrentDocument = useCallback((): { ok: true } | { ok: false; error: string } => {
    const state = editorStore.getState();
    if (state.activeTxn) return { ok: false, error: "Cannot duplicate a document during an active transaction." };
    if (!confirmProceedIfQuotaBlocked("Duplicating the current document")) return { ok: false, error: "Cancelled." };

    flushAutosaveIfEnabled();

    const duplicated = duplicateWorkspaceDocument(state.doc);
    if (!duplicated.ok) {
      setPersistence({ state: "error", error: duplicated.error, quota: duplicated.quota });
      pushToast("error", duplicated.error);
      return { ok: false, error: duplicated.error };
    }

    activateLoadedDocument(duplicated.docId, duplicated.doc);
    pushToast("info", "Duplicated document.");
    return { ok: true };
  }, [activateLoadedDocument, confirmProceedIfQuotaBlocked, flushAutosaveIfEnabled, pushToast]);

  const deleteCurrentDocument = useCallback((): { ok: true } | { ok: false; error: string } => {
    const state = editorStore.getState();
    if (state.activeTxn) return { ok: false, error: "Cannot delete a document during an active transaction." };

    const title = state.doc.meta.title?.trim() ? state.doc.meta.title.trim() : docId;
    const ok = window.confirm(`Delete "${title}"?\n\nThis removes the saved snapshot and backup from LocalStorage.`);
    if (!ok) return { ok: false, error: "Cancelled." };

    stopAutosaveController();

    const deleted = deleteWorkspaceDocument(docId);
    if (!deleted.ok) {
      pushToast("error", deleted.error);
      return { ok: false, error: deleted.error };
    }

    refreshWorkspaceDocs();
    const remaining = listWorkspaceDocuments();

    if (remaining.length > 0) {
      activateDocId(remaining[0]!.id);
      pushToast("info", "Deleted document.");
      return { ok: true };
    }

    const created = createWorkspaceDocument({ docId: "default" });
    if (!created.ok) {
      setPersistence({ state: "error", error: created.error, quota: created.quota });
      pushToast("error", created.error);
      return { ok: false, error: created.error };
    }

    activateLoadedDocument(created.docId, created.doc);
    pushToast("info", "Deleted document.");
    return { ok: true };
  }, [activateDocId, activateLoadedDocument, docId, pushToast, refreshWorkspaceDocs, stopAutosaveController]);

  const renameCurrentDocument = useCallback(
    (title: string): { ok: true } | { ok: false; error: string } => {
      const trimmed = title.trim();
      if (!trimmed) {
        pushToast("error", "Document title cannot be empty.");
        return { ok: false, error: "Document title cannot be empty." };
      }

      editorStore.getState().dispatch({ type: "UPDATE_META", patch: { title: trimmed } }, { historyLabel: "Rename" });

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
          return { ok: false, error: res.error };
        }
        setPersistence({ state: "saved", at: Date.now() });
      }

      refreshWorkspaceDocs();
      pushToast("info", "Renamed document.");
      return { ok: true };
    },
    [autosaveEnabled, docId, pushToast, refreshWorkspaceDocs],
  );

  const clearSavedAfterQuota = useCallback(
    (targetDocId: string): { ok: true } | { ok: false; error: string } => {
      const ok = window.confirm(
        "This will clear the saved snapshot and backup from LocalStorage. Your current document will remain open and will be saved again. Continue?",
      );
      if (!ok) return { ok: false, error: "Cancelled." };

      const cleared = clearLocalStorage(targetDocId);
      if (!cleared.ok) {
        pushToast("error", cleared.error);
        return { ok: false, error: cleared.error };
      }

      resetAutosaveQuotaBlock();
      setAutosaveEnabled(true);

      setPersistence({ state: "saving" });
      const res = saveWorkspaceDocument(targetDocId, editorStore.getState().doc, { rotateBackup: false });
      if (!res.ok) {
        setPersistence({ state: "error", error: res.error, quota: res.quota });
        pushToast("error", res.error);
        return { ok: false, error: res.error };
      }

      setPersistence({ state: "saved", at: Date.now() });
      refreshWorkspaceDocs();
      pushToast("info", "Cleared saved snapshots and resumed saving.");
      return { ok: true };
    },
    [pushToast, refreshWorkspaceDocs, resetAutosaveQuotaBlock],
  );

  const resetCurrentDocument = useCallback((): { ok: true } | { ok: false; error: string } => {
    const cleared = clearLocalStorage(docId);
    if (!cleared.ok) {
      pushToast("error", cleared.error);
      return { ok: false, error: cleared.error };
    }

    const next = createDefaultDocument();
    editorStore.getState().replaceDocument(next);
    setRecovery(null);
    setRecoveryOpen(false);
    setAutosaveEnabled(true);
    resetAutosaveQuotaBlock();

    setPersistence({ state: "saving" });
    const res = saveWorkspaceDocument(docId, next, { rotateBackup: false });
    if (!res.ok) {
      setPersistence({ state: "error", error: res.error, quota: res.quota });
      pushToast("error", res.error);
      return { ok: false, error: res.error };
    }

    setPersistence({ state: "saved", at: Date.now() });
    refreshWorkspaceDocs();
    pushToast("info", "Reset document.");
    return { ok: true };
  }, [docId, pushToast, refreshWorkspaceDocs, resetAutosaveQuotaBlock]);

  const overwriteSavedAndEnableAutosave = useCallback((): { ok: true } | { ok: false; error: string } => {
    const ok = window.confirm(
      "This will permanently delete the saved snapshot and backup from LocalStorage. Export any recovery JSON first. Continue?",
    );
    if (!ok) return { ok: false, error: "Cancelled." };

    const cleared = clearLocalStorage(docId);
    if (!cleared.ok) {
      pushToast("error", cleared.error);
      return { ok: false, error: cleared.error };
    }

    setRecovery(null);
    setRecoveryOpen(false);
    setAutosaveEnabled(true);
    resetAutosaveQuotaBlock();

    setPersistence({ state: "saving" });
    const res = saveWorkspaceDocument(docId, editorStore.getState().doc, { rotateBackup: false });
    if (!res.ok) {
      setPersistence({ state: "error", error: res.error, quota: res.quota });
      pushToast("error", res.error);
      return { ok: false, error: res.error };
    }

    setPersistence({ state: "saved", at: Date.now() });
    refreshWorkspaceDocs();
    pushToast("info", "Saving re-enabled.");
    return { ok: true };
  }, [docId, pushToast, refreshWorkspaceDocs, resetAutosaveQuotaBlock]);

  const loadBackupSnapshotForRecovery = useCallback((): { ok: true } | { ok: false; error: string } => {
    const loaded = loadBackupFromLocalStorage(docId);
    if (!loaded.ok) {
      pushToast("error", `Failed to load backup snapshot. ${loaded.error}`);
      return { ok: false, error: loaded.error };
    }

    editorStore.getState().replaceDocument(loaded.doc);
    pushToast("info", "Loaded backup snapshot. Saving remains disabled until you clear the newer saved document.");
    return { ok: true };
  }, [docId, pushToast]);

  return {
    docId,
    workspaceDocs,
    persistence,
    autosaveEnabled,
    recovery,
    recoveryOpen,
    activateDocId,
    refreshWorkspaceDocs,
    stopAutosaveController,
    flushAutosaveIfEnabled,
    flushAutosaveNow,
    resetAutosaveQuotaBlock,
    isAutosaveQuotaBlocked,
    setAutosaveEnabled,
    setRecovery,
    setRecoveryOpen,
    setDocId,
    confirmProceedIfQuotaBlocked,
    createNewDocument,
    duplicateCurrentDocument,
    deleteCurrentDocument,
    clearSavedAfterQuota,
    resetCurrentDocument,
    overwriteSavedAndEnableAutosave,
    loadBackupSnapshotForRecovery,
    renameCurrentDocument,
  };
}
