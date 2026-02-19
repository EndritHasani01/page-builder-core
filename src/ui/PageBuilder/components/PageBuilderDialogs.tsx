import { useMemo, useState } from "react";

import { cloneSubtree, remapIds, validateDocument } from "@/editor-core";
import { collectHtmlExportWarnings, exportDocumentToHtml, exportDocumentToJson } from "@/export";
import { useEditorStore } from "@/store";
import { parseDocumentJsonText } from "@/persistence";

import type { PageBuilderDialog } from "../hooks/usePageBuilderKeyboardShortcuts";
import type { RecoveryInfo } from "../hooks/usePageBuilderPersistence";
import { downloadText, sanitizeFilename } from "../pageBuilderUtils";

import { Modal } from "./Overlays";

import styles from "../PageBuilder.module.css";

export function PageBuilderDialogs(props: {
  dialog: PageBuilderDialog;
  onCloseDialog: () => void;
  onToast: (kind: "info" | "error", message: string) => void;

  resetOpen: boolean;
  onCloseReset: () => void;
  onConfirmReset: () => void;

  renameOpen: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onCloseRename: () => void;
  onConfirmRename: () => void;

  recoveryOpen: boolean;
  recovery: RecoveryInfo | null;
  docId: string;
  onCloseRecovery: () => void;
  onOpenReset: () => void;
  onOverwriteSavedAndEnableAutosave: () => void;
  onLoadBackupForRecovery: () => void;
}) {
  return (
    <>
      {props.dialog === "shortcuts" ? <ShortcutsDialog onClose={props.onCloseDialog} /> : null}

      {props.dialog === "export" ? <ExportDialog onClose={props.onCloseDialog} onToast={props.onToast} /> : null}

      {props.dialog === "import" ? <ImportDialog onClose={props.onCloseDialog} onToast={props.onToast} /> : null}

      {props.resetOpen ? <ResetDialog onClose={props.onCloseReset} onConfirm={props.onConfirmReset} /> : null}

      {props.renameOpen ? (
        <RenameDialog
          value={props.renameValue}
          onChange={props.onRenameValueChange}
          onClose={props.onCloseRename}
          onConfirm={props.onConfirmRename}
        />
      ) : null}

      {props.recoveryOpen && props.recovery ? (
        <RecoveryDialog
          recovery={props.recovery}
          docId={props.docId}
          onClose={props.onCloseRecovery}
          onOpenReset={props.onOpenReset}
          onOverwriteSavedAndEnableAutosave={props.onOverwriteSavedAndEnableAutosave}
          onLoadBackup={props.onLoadBackupForRecovery}
        />
      ) : null}
    </>
  );
}

function RenameDialog(props: { value: string; onChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Rename document" onClose={props.onClose}>
      <div className={styles.dialogSection}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>Title</span>
          <input
            type="text"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder="Document title"
            autoFocus
          />
        </label>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={props.onConfirm}>
            Rename
          </button>
          <button type="button" className={styles.button} onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
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

function ExportDialog(props: { onClose: () => void; onToast: (k: "info" | "error", m: string) => void }) {
  const doc = useEditorStore((s) => s.doc);
  const breakpoint = useEditorStore((s) => s.breakpoint);

  const [mode, setMode] = useState<"full" | "snippet">("full");

  const warnings = useMemo(() => collectHtmlExportWarnings(doc), [doc]);

  const onDownloadJson = () => {
    const filename = `${sanitizeFilename(doc.meta.title || "page")}.pagebuilder.json`;
    const { json } = exportDocumentToJson(doc);
    downloadText(filename, json, "application/json");
    props.onToast("info", "Exported JSON.");
  };

  const onDownloadHtml = () => {
    const filename = `${sanitizeFilename(doc.meta.title || "page")}.${breakpoint}.html`;
    void exportDocumentToHtml(doc, { breakpoint, mode })
      .then((res) => {
        downloadText(filename, res.html, "text/html");
        props.onToast(
          "info",
          res.warnings.length > 0 ? `Exported HTML with ${res.warnings.length} warning(s).` : "Exported HTML.",
        );
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
            Download HTML ({breakpoint})
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

function ImportDialog(props: { onClose: () => void; onToast: (k: "info" | "error", m: string) => void }) {
  const currentDoc = useEditorStore((s) => s.doc);
  const idFactory = useEditorStore((s) => s.idFactory);
  const dispatch = useEditorStore((s) => s.dispatch);
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const commitTransaction = useEditorStore((s) => s.commitTransaction);
  const replaceDocument = useEditorStore((s) => s.replaceDocument);

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
    replaceDocument(parsed.doc);
    props.onToast("info", "Imported document (replaced).");
    props.onClose();
  };

  const applyMerge = () => {
    setParseAttempted(true);
    if (!parsed.ok) return;
    const importedRoot = parsed.doc.nodes[parsed.doc.rootId];
    const currentRoot = currentDoc.nodes[currentDoc.rootId];

    if (!importedRoot || importedRoot.type !== "page" || !currentRoot || currentRoot.type !== "page") {
      props.onToast("error", "Merge expects a Page root document.");
      return;
    }

    const sections = importedRoot.children.filter((id) => parsed.doc.nodes[id]?.type === "section");
    if (sections.length === 0) {
      props.onToast("error", "Imported document has no sections to merge.");
      return;
    }

    const insertAtStart = currentDoc.nodes[currentDoc.rootId]?.children.length ?? 0;

    beginTransaction("Import merge");
    let offset = 0;
    for (const sectionId of sections) {
      const subtree = cloneSubtree(parsed.doc, sectionId);
      const remapped = remapIds(subtree, idFactory);
      dispatch(
        { type: "INSERT_SUBTREE", parentId: currentDoc.rootId, index: insertAtStart + offset, subtree: remapped },
        { historyLabel: "Merge" },
      );
      offset++;
    }
    commitTransaction();

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
          This clears the saved snapshot and backup in LocalStorage and replaces the current document with the default template.
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
            A document saved by a newer app version was found. To avoid data loss, saving is disabled until you export the saved JSON
            and clear LocalStorage.
          </p>
        ) : (
          <p className={styles.muted}>
            The saved snapshot could not be loaded. You can export the raw JSON for manual recovery and reset the editor to a fresh
            document.
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
