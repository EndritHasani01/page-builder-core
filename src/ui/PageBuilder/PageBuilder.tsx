import type { CSSProperties, ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Breakpoint, Document, IdFactory, NodeId, NodeType, StyleProps, Subtree, ValidationIssue } from "@/editor-core";
import {
  COLOR_TOKENS,
  FONT_FAMILY_TOKENS,
  FONT_SIZE_TOKENS,
  blockRegistry,
  cloneSubtree,
  createNode,
  getEffectiveStyleValue,
  getInheritedStyleValue,
  getSpacingTokens,
  isStyleKeyOverridden,
  isProbablySafeUrl,
  migrateToLatest,
  remapIds,
  validateDocument,
} from "@/editor-core";
import { RenderDocument, themeToCssVars } from "@/renderer";
import type { DispatchOptions, EditorAction, Mode } from "@/store";
import { editorStore, useEditorStore } from "@/store";
import type { PersistenceStatus } from "@/persistence";
import { loadFromLocalStorage, startAutosave } from "@/persistence";

import styles from "./PageBuilder.module.css";

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
  const beginTransaction = useEditorStore((s) => s.beginTransaction);
  const commitTransaction = useEditorStore((s) => s.commitTransaction);
  const replaceDocument = useEditorStore((s) => s.replaceDocument);

  const [inspectorTab, setInspectorTab] = useState<"content" | "style">("content");
  const [dialog, setDialog] = useState<null | "import" | "export">(null);
  const [mobilePanel, setMobilePanel] = useState<null | "palette" | "inspector">(null);
  const [persistence, setPersistence] = useState<PersistenceStatus>({ state: "idle" });

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

  const docId = "default";
  const isNarrow = useMediaQuery("(max-width: 1024px)");

  useEffect(() => {
    const loaded = loadFromLocalStorage(docId);
    if (!loaded.ok) {
      if (loaded.error !== "Not found.") {
        window.setTimeout(() => pushToast("error", `Failed to load saved document. ${loaded.error}`), 0);
      }
      return;
    }

    replaceDocument(loaded.doc);
    window.setTimeout(() => setPersistence({ state: "saved", at: Date.now() }), 0);

    if (loaded.recoveredFromBackup) {
      window.setTimeout(() => pushToast("info", "Recovered document from LocalStorage backup."), 0);
    }
    if (loaded.migratedFrom) {
      window.setTimeout(() => pushToast("info", `Migrated document from schema ${loaded.migratedFrom}.`), 0);
    }
  }, [pushToast, replaceDocument]);

  useEffect(() => {
    const stop = startAutosave(editorStore, docId, { onStatus: setPersistence });
    return stop;
  }, [docId]);

  const lastPersistenceError = useRef<string | null>(null);
  useEffect(() => {
    if (persistence.state !== "error") return;
    if (persistence.error === lastPersistenceError.current) return;
    lastPersistenceError.current = persistence.error;
    window.setTimeout(() => pushToast("error", persistence.error), 0);
  }, [persistence, pushToast]);

  const themeStyle = useMemo(() => themeToCssVars(doc.theme) as CSSProperties, [doc.theme]);

  const isPreview = mode === "preview";
  const renderMode = isPreview ? "preview" : "editor";

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
    },
    [dispatch, doc.rootId, isPreview],
  );

  const onCanvasKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dispatch({ type: "SET_SELECTED", nodeId: doc.rootId });
        dispatch({ type: "SET_HOVERED", nodeId: null });
      }
    },
    [dispatch, doc.rootId],
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

  return (
    <div className={styles.themeRoot} style={themeStyle}>
      <header className={styles.toolbar}>
        <h1 className={styles.brand}>Page Builder</h1>

        <div className={styles.controls}>
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
            {persistence.state === "saving"
              ? "Saving"
              : persistence.state === "error"
                ? "Save error"
                : persistence.state === "saved"
                  ? "Saved"
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
        </div>
      </header>

      <main className={styles.main} data-narrow={isNarrow ? "true" : "false"}>
        {!isNarrow ? (
          <aside className={styles.panel} aria-label="Palette">
            <div className={styles.panelTitle}>Palette</div>
            <div className={styles.panelBody}>
              <PaletteList disabled={isPreview} onInsert={insertFromPaletteAndMaybeClose} />
            </div>
          </aside>
        ) : null}

        <section className={styles.canvas} aria-label="Canvas">
          <div
            className={styles.canvasFrame}
            data-mode={mode}
            data-bp={breakpoint}
            tabIndex={0}
            onKeyDown={onCanvasKeyDown}
            onMouseLeave={() => dispatch({ type: "SET_HOVERED", nodeId: null })}
          >
            <div className={styles.canvasTitle}>Canvas ({mode})</div>
            <div className={styles.canvasBody} onClick={onCanvasClick}>
              <RenderDocument
                doc={doc}
                mode={renderMode}
                breakpoint={breakpoint}
                disableNavigation={isPreview}
                selectedId={renderMode === "editor" ? selectedId : null}
                hoveredId={renderMode === "editor" ? hoveredId : null}
                onSelect={renderMode === "editor" ? onSelect : undefined}
                onHover={renderMode === "editor" ? onHover : undefined}
              />
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
          <PaletteList disabled={isPreview} onInsert={insertFromPaletteAndMaybeClose} />
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
    </div>
  );
}

function PaletteList(props: { disabled: boolean; onInsert: (nodeType: NodeType) => void }) {
  return (
    <ul className={styles.paletteList} aria-disabled={props.disabled}>
      {Object.values(blockRegistry)
        .filter((b) => b.type !== "page" && b.type !== "column")
        .map((b) => (
          <li key={b.type} className={styles.paletteItem}>
            <button
              type="button"
              className={styles.paletteButton}
              disabled={props.disabled}
              data-palette-block-type={b.type}
              onClick={() => props.onInsert(b.type)}
            >
              {b.label}
            </button>
          </li>
        ))}
    </ul>
  );
}

function Drawer(props: { title: string; side: "left" | "right"; children: React.ReactNode; onClose: () => void }) {
  const { title, side, children, onClose } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={rootRef} className={styles.modal} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
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

function ExportDialog(props: { doc: Document; breakpoint: Breakpoint; onClose: () => void; onToast: (k: "info" | "error", m: string) => void }) {
  const [mode, setMode] = useState<"full" | "snippet">("full");

  const warnings = useMemo(() => collectExportWarnings(props.doc), [props.doc]);

  const onDownloadJson = () => {
    const filename = `${sanitizeFilename(props.doc.meta.title || "page")}.pagebuilder.json`;
    downloadText(filename, JSON.stringify(props.doc, null, 2), "application/json");
    props.onToast("info", "Exported JSON.");
  };

  const onDownloadHtml = () => {
    const filename = `${sanitizeFilename(props.doc.meta.title || "page")}.${props.breakpoint}.html`;
    void exportToHtml(props.doc, { breakpoint: props.breakpoint, mode })
      .then((html) => {
        downloadText(filename, html, "text/html");
        props.onToast("info", "Exported HTML.");
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
    try {
      const json = JSON.parse(raw);
      const migrated = migrateToLatest(json);
      const issues = validateDocument(migrated);
      return { ok: true as const, doc: migrated, issues };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid JSON.";
      return { ok: false as const, error: msg };
    }
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

function sanitizeFilename(input: string): string {
  const trimmed = input.trim() || "page";
  return trimmed
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
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

async function exportToHtml(doc: Document, opts: { breakpoint: Breakpoint; mode: "full" | "snippet" }): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<RenderDocument doc={doc} mode="export" breakpoint={opts.breakpoint} />);
  if (opts.mode === "snippet") return body;

  const root = doc.nodes[doc.rootId];
  const lang = root && root.type === "page" ? (root.props as { lang?: string }).lang : "en";
  const safeLang = isProbablyValidLang(lang ?? "en") ? lang ?? "en" : "en";
  const title = escapeHtml(doc.meta.title || "Page");

  return [
    "<!doctype html>",
    `<html lang="${escapeAttr(safeLang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].join("");
}

function collectExportWarnings(doc: Document): string[] {
  const hiddenCount = Object.values(doc.nodes).filter((n) => Boolean(n.constraints?.hidden)).length;

  const unsafe: Array<{ nodeId: NodeId; kind: string; value: string }> = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "image") {
      const src = (n.props as { src: string }).src;
      const linkTo = (n.props as { linkTo?: string }).linkTo;
      if (src.trim() && !isProbablySafeUrl(src)) unsafe.push({ nodeId: n.id, kind: "image.src", value: src });
      if (linkTo && linkTo.trim() && !isProbablySafeUrl(linkTo)) unsafe.push({ nodeId: n.id, kind: "image.linkTo", value: linkTo });
    }
    if (n.type === "button") {
      const href = (n.props as { href: string }).href;
      if (href.trim() && !isProbablySafeUrl(href)) unsafe.push({ nodeId: n.id, kind: "button.href", value: href });
    }
  }

  const out: string[] = [];
  if (hiddenCount > 0) out.push(`${hiddenCount} hidden node(s) are excluded from preview/export.`);
  if (unsafe.length > 0) out.push(`Unsafe URLs will be removed in export (${unsafe.length}).`);
  if (unsafe.length > 0) {
    out.push(
      ...unsafe.slice(0, 5).map((u) => `- ${u.kind} on ${u.nodeId}: ${u.value}`),
    );
    if (unsafe.length > 5) out.push(`- ...and ${unsafe.length - 5} more`);
  }
  return out;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

function isProbablyValidLang(input: string): boolean {
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(input.trim());
}
