import type { Dispatch, SetStateAction } from "react";

import type { Breakpoint } from "@/editor-core";
import { useEditorStore } from "@/store";
import type { PersistenceStatus, WorkspaceDocMeta } from "@/persistence";

import type { PageBuilderDialog, PageBuilderMobilePanel } from "../hooks/usePageBuilderKeyboardShortcuts";
import type { RecoveryInfo } from "../hooks/usePageBuilderPersistence";
import { formatShortTime } from "../pageBuilderUtils";

import styles from "../PageBuilder.module.css";

export function PageBuilderToolbar(props: {
  docId: string;
  workspaceDocs: WorkspaceDocMeta[];
  onSwitchDocument: (nextDocId: string) => void;
  onCreateNewDocument: () => void;
  onOpenRenameDialog: () => void;
  onDuplicateCurrentDocument: () => void;
  onDeleteCurrentDocument: () => void;
  onSaveNow: () => void;
  onOpenReset: () => void;
  onOpenRecovery: () => void;
  onClearSavedAfterQuota: (targetDocId: string) => void;

  autosaveEnabled: boolean;
  persistence: PersistenceStatus;
  recovery: RecoveryInfo | null;

  themeOpen: boolean;
  onToggleTheme: () => void;

  isNarrow: boolean;
  dialog: PageBuilderDialog;
  setDialog: Dispatch<SetStateAction<PageBuilderDialog>>;
  mobilePanel: PageBuilderMobilePanel;
  setMobilePanel: Dispatch<SetStateAction<PageBuilderMobilePanel>>;
}) {
  const mode = useEditorStore((s) => s.mode);
  const breakpoint = useEditorStore((s) => s.breakpoint);
  const issues = useEditorStore((s) => s.issues);
  const activeTxn = useEditorStore((s) => s.activeTxn);
  const undoStackLen = useEditorStore((s) => s.undoStack.length);
  const redoStackLen = useEditorStore((s) => s.redoStack.length);

  const dispatch = useEditorStore((s) => s.dispatch);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const statusText = !props.autosaveEnabled
    ? "Autosave off"
    : props.persistence.state === "saving"
      ? "Saving"
      : props.persistence.state === "error" && props.persistence.quota
        ? "Storage full"
        : props.persistence.state === "error"
          ? "Save error"
          : props.persistence.state === "saved"
            ? `Saved ${formatShortTime(props.persistence.at)}`
            : undoStackLen > 0
              ? "Unsaved"
              : "Idle";

  const errorCount = issues.filter((i) => i.level === "error").length;

  return (
    <header className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <h1 className={styles.brand}>Page Builder</h1>

        <div className={styles.controls}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>Document</span>
            <select
              value={props.docId}
              onChange={(e) => {
                props.setDialog(null);
                props.setMobilePanel(null);
                props.onSwitchDocument(e.target.value);
              }}
              aria-label="Document"
              disabled={Boolean(activeTxn)}
            >
              {props.workspaceDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title && d.title.trim() ? d.title.trim() : d.id}
                </option>
              ))}
              {props.workspaceDocs.some((d) => d.id === props.docId) ? null : <option value={props.docId}>{props.docId}</option>}
            </select>
          </label>

          <button
            className={styles.button}
            type="button"
            onClick={() => {
              props.setDialog(null);
              props.setMobilePanel(null);
              props.onCreateNewDocument();
            }}
            disabled={Boolean(activeTxn)}
            aria-label="New document"
          >
            New
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={props.onOpenRenameDialog}
            disabled={Boolean(activeTxn) || !props.autosaveEnabled || Boolean(props.recovery)}
            aria-label="Rename document"
          >
            Rename
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              props.setDialog(null);
              props.setMobilePanel(null);
              props.onDuplicateCurrentDocument();
            }}
            disabled={Boolean(activeTxn) || Boolean(props.recovery)}
            aria-label="Duplicate document"
          >
            Duplicate
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              props.setDialog(null);
              props.setMobilePanel(null);
              props.onDeleteCurrentDocument();
            }}
            disabled={Boolean(activeTxn) || Boolean(props.recovery)}
            aria-label="Delete document"
          >
            Delete
          </button>

          <label className={styles.control} data-tour="preview-toggle">
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
              props.setMobilePanel(null);
              props.setDialog("shortcuts");
            }}
            aria-label="Keyboard shortcuts"
          >
            Shortcuts
          </button>

          {props.isNarrow ? (
            <>
              <button
                className={styles.button}
                type="button"
                onClick={() => props.setMobilePanel((prev) => (prev === "palette" ? null : "palette"))}
                aria-label="Toggle palette"
                aria-haspopup="dialog"
                aria-expanded={props.mobilePanel === "palette"}
              >
                Palette
              </button>
              <button
                className={styles.button}
                type="button"
                onClick={() => props.setMobilePanel((prev) => (prev === "inspector" ? null : "inspector"))}
                aria-label="Toggle inspector"
                aria-haspopup="dialog"
                aria-expanded={props.mobilePanel === "inspector"}
              >
                Inspector
              </button>
            </>
          ) : null}

          <button
            className={props.themeOpen ? styles.buttonActive : styles.button}
            type="button"
            onClick={props.onToggleTheme}
            aria-label="Toggle Design Tokens panel"
            aria-pressed={props.themeOpen}
          >
            Theme
          </button>

          <button
            className={styles.button}
            type="button"
            onClick={() => {
              props.setMobilePanel(null);
              props.setDialog("import");
            }}
            aria-label="Import JSON"
          >
            Import
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              props.setMobilePanel(null);
              props.setDialog("export");
            }}
            aria-label="Export"
          >
            Export
          </button>

          <span className={styles.status} role="status" aria-label="Status" data-tour="save-status">
            {statusText}
          </span>
          {issues.length > 0 ? (
            <span
              className={errorCount > 0 ? styles.statusError : styles.statusWarn}
              role="status"
              aria-label="Validation status"
            >
              {errorCount > 0 ? `${errorCount} errors` : `${issues.length} warnings`}
            </span>
          ) : null}

          <button
            className={styles.button}
            type="button"
            onClick={props.onSaveNow}
            disabled={
              !props.autosaveEnabled ||
              props.persistence.state === "saving" ||
              Boolean(activeTxn) ||
              (props.persistence.state === "error" && props.persistence.quota)
            }
            aria-label="Save now"
          >
            Save now
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={props.onOpenReset}
            disabled={Boolean(activeTxn)}
            aria-label="Reset document"
          >
            Reset
          </button>
        </div>
      </div>

      {props.recovery ? (
        <div className={styles.banner} data-kind="error" role="status" aria-label="Recovery status">
          <div className={styles.bannerMessage}>
            Saved data could not be loaded ({props.recovery.code}). Autosave is disabled until you recover or reset.
          </div>
          <div className={styles.bannerActions}>
            <button type="button" className={styles.bannerButton} onClick={props.onOpenRecovery}>
              Recovery
            </button>
            <button type="button" className={styles.bannerButton} onClick={props.onOpenReset}>
              Reset
            </button>
          </div>
        </div>
      ) : props.persistence.state === "error" && props.persistence.quota ? (
        <div className={styles.banner} data-kind="error" role="status" aria-label="Storage status">
          <div className={styles.bannerMessage}>
            LocalStorage is full. Autosave is paused. Export JSON, then clear saved data to resume saving.
          </div>
          <div className={styles.bannerActions}>
            <button
              type="button"
              className={styles.bannerButton}
              onClick={() => {
                props.setMobilePanel(null);
                props.setDialog("export");
              }}
            >
              Export
            </button>
            <button type="button" className={styles.bannerButton} onClick={() => props.onClearSavedAfterQuota(props.docId)}>
              Clear saved
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
