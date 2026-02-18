export type { AutosaveController, PersistenceStatus } from "./autosave";
export { startAutosave } from "./autosave";

export type { ParseDocumentErrorCode, ParseDocumentResult } from "./parseDocument";
export { parseDocumentJsonText } from "./parseDocument";

export type { LoadResult, SaveResult } from "./localStorage";
export { clearLocalStorage, loadBackupFromLocalStorage, loadFromLocalStorage, saveToLocalStorage } from "./localStorage";

export type { WorkspaceDocMeta } from "./workspace";
export {
  clearActiveWorkspaceDocId,
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  duplicateWorkspaceDocument,
  ensureWorkspaceEntryForDocument,
  getActiveWorkspaceDocId,
  listWorkspaceDocuments,
  loadWorkspaceDocument,
  removeWorkspaceDocumentMeta,
  saveWorkspaceDocument,
  setActiveWorkspaceDocId,
  upsertWorkspaceDocumentMeta,
} from "./workspace";
