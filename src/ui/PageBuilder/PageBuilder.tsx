import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DndContext, DragOverlay } from "@dnd-kit/core";

import type { NodeType } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import { themeToCssVars } from "@/renderer";
import { editorStore, useEditorStore } from "@/store";
import { useMediaQuery } from "@/ui/hooks/useMediaQuery";

import { CommandPalette } from "./components/CommandPalette";
import { Drawer } from "./components/Overlays";
import { ComponentLibrary } from "./components/ComponentLibrary";
import { DesignTokensPanel } from "./components/DesignTokensPanel";
import { GuidedTour, shouldShowTour } from "./components/GuidedTour";
import { LayerTree } from "./components/LayerTree";
import { PageBuilderCanvas } from "./components/PageBuilderCanvas";
import { PageBuilderDialogs } from "./components/PageBuilderDialogs";
import { PageBuilderInspector } from "./components/PageBuilderInspector";
import { PageBuilderToolbar } from "./components/PageBuilderToolbar";
import { PaletteDragPreview } from "./components/PaletteDragPreview";
import { PaletteList } from "./components/PaletteList";
import { SaveToLibraryModal } from "./components/SaveToLibraryModal";
import { TemplateGallery } from "./components/TemplateGallery";
import { ToastHost } from "./components/ToastHost";
import { cloneSubtree } from "@/editor-core/subtree";
import { saveComponent } from "@/persistence/componentLibrary";
import { TEMPLATES } from "@/templates";
import { usePageBuilderDnd } from "./hooks/usePageBuilderDnd";
import {
  type PageBuilderDialog,
  type PageBuilderMobilePanel,
  usePageBuilderKeyboardShortcuts,
} from "./hooks/usePageBuilderKeyboardShortcuts";
import { usePageBuilderPersistence } from "./hooks/usePageBuilderPersistence";
import { usePaletteInsertion } from "./hooks/usePaletteInsertion";
import { getNodeLabel } from "./pageBuilderUtils";
import { useToastHost } from "./hooks/useToastHost";

import styles from "./PageBuilder.module.css";

const PANEL_WIDTHS_KEY = "pb:ui:panelWidths";
const MIN_PANEL_W = 150;
const MAX_PANEL_W = 400;

function readSavedPanelWidths(): { left: number; right: number } {
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    if (!raw) return { left: 280, right: 320 };
    const parsed = JSON.parse(raw) as { left?: number; right?: number };
    return {
      left: typeof parsed.left === "number" ? parsed.left : 280,
      right: typeof parsed.right === "number" ? parsed.right : 320,
    };
  } catch {
    return { left: 280, right: 320 };
  }
}

export function PageBuilder() {
  const { toasts, pushToast, dismissToast } = useToastHost();

  const persistence = usePageBuilderPersistence({ pushToast });

  const [leftTab, setLeftTab] = useState<"blocks" | "layers" | "library">("blocks");
  const [saveToLibraryNodeId, setSaveToLibraryNodeId] = useState<string | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [themeOpen, setThemeOpen] = useState(false);
  const [dialog, setDialog] = useState<PageBuilderDialog>(null);
  const [mobilePanel, setMobilePanel] = useState<PageBuilderMobilePanel>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tourActive, setTourActive] = useState(() => shouldShowTour());

  // Panel resize state
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => readSavedPanelWidths().left);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => readSavedPanelWidths().right);

  useEffect(() => {
    try {
      localStorage.setItem(
        PANEL_WIDTHS_KEY,
        JSON.stringify({ left: leftPanelWidth, right: rightPanelWidth }),
      );
    } catch {
      // ignore quota errors
    }
  }, [leftPanelWidth, rightPanelWidth]);

  const startResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftPanelWidth;
      const onMove = (ev: MouseEvent) => {
        setLeftPanelWidth(Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, startW + ev.clientX - startX)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [leftPanelWidth],
  );

  const startResizeRight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightPanelWidth;
      const onMove = (ev: MouseEvent) => {
        // Dragging left = wider right panel
        setRightPanelWidth(Math.max(MIN_PANEL_W, Math.min(MAX_PANEL_W, startW + startX - ev.clientX)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rightPanelWidth],
  );

  const { insertFromPalette } = usePaletteInsertion({ pushToast });

  const isNarrow = useMediaQuery("(max-width: 1024px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasBodyRef = useRef<HTMLDivElement | null>(null);

  const focusCanvasFrame = useCallback(() => {
    const el = canvasFrameRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, []);

  const theme = useEditorStore((s) => s.doc.theme);
  const themeStyle = useMemo(() => themeToCssVars(theme) as CSSProperties, [theme]);

  const dndEnabled = useEditorStore((s) => s.mode !== "preview" && !s.activeTxn);

  const dnd = usePageBuilderDnd({ canvasBodyRef, pushToast });

  usePageBuilderKeyboardShortcuts({
    dialog,
    mobilePanel,
    resetOpen,
    recoveryOpen: persistence.recoveryOpen,
    commandPaletteOpen,
    activeDrag: dnd.activeDrag,
    setDialog,
    setMobilePanel,
    setResetOpen,
    setRecoveryOpen: persistence.setRecoveryOpen,
    setCommandPaletteOpen,
    pushToast,
    focusCanvasFrame,
    canvasFrameRef,
  });

  const insertFromPaletteAndMaybeClose = useCallback(
    (nodeType: NodeType) => {
      insertFromPalette(nodeType);
      if (isNarrow) setMobilePanel(null);
    },
    [insertFromPalette, isNarrow],
  );

  const onSaveToLibrary = useCallback((nodeId: string) => {
    setSaveToLibraryNodeId(nodeId);
  }, []);

  const onAddSection = useCallback(() => {
    insertFromPaletteAndMaybeClose("section");
  }, [insertFromPaletteAndMaybeClose]);

  const onSwitchDocument = useCallback(
    (nextDocId: string) => {
      const trimmed = nextDocId.trim();
      if (!trimmed) return;
      if (trimmed === persistence.docId) return;
      if (editorStore.getState().activeTxn) return;
      if (!persistence.confirmProceedIfQuotaBlocked("Switching documents")) return;
      persistence.flushAutosaveIfEnabled();
      persistence.activateDocId(trimmed);
    },
    [persistence],
  );

  const onOpenRenameDialog = useCallback(() => {
    setRenameValue(editorStore.getState().doc.meta.title ?? "");
    setRenameOpen(true);
  }, []);

  const onConfirmRename = useCallback(() => {
    const res = persistence.renameCurrentDocument(renameValue);
    if (res.ok) setRenameOpen(false);
  }, [persistence, renameValue]);

  const onConfirmReset = useCallback(() => {
    const res = persistence.resetCurrentDocument();
    if (res.ok) setResetOpen(false);
  }, [persistence]);

  const mainStyle = isNarrow
    ? undefined
    : ({ "--pb-left-w": `${leftPanelWidth}px`, "--pb-right-w": `${rightPanelWidth}px` } as CSSProperties);

  return (
    <div className={styles.themeRoot} style={themeStyle}>
      <DndContext {...dnd.dndContextProps}>
        <PageBuilderToolbar
          docId={persistence.docId}
          workspaceDocs={persistence.workspaceDocs}
          onSwitchDocument={onSwitchDocument}
          onCreateNewDocument={() => {
            setDialog(null);
            setMobilePanel(null);
            setTemplateGalleryOpen(true);
          }}
          onOpenRenameDialog={onOpenRenameDialog}
          onDuplicateCurrentDocument={() => {
            void persistence.duplicateCurrentDocument();
          }}
          onDeleteCurrentDocument={() => {
            void persistence.deleteCurrentDocument();
          }}
          onSaveNow={persistence.flushAutosaveNow}
          onOpenReset={() => setResetOpen(true)}
          onOpenRecovery={() => persistence.setRecoveryOpen(true)}
          onClearSavedAfterQuota={(targetDocId) => {
            void persistence.clearSavedAfterQuota(targetDocId);
          }}
          autosaveEnabled={persistence.autosaveEnabled}
          persistence={persistence.persistence}
          recovery={persistence.recovery}
          themeOpen={themeOpen}
          onToggleTheme={() => setThemeOpen((o) => !o)}
          isNarrow={isNarrow}
          dialog={dialog}
          setDialog={setDialog}
          mobilePanel={mobilePanel}
          setMobilePanel={setMobilePanel}
        />

        <main className={styles.main} style={mainStyle} data-narrow={isNarrow ? "true" : "false"}>
          {!isNarrow ? (
            <aside className={styles.panel} aria-label="Palette" data-tour="palette">
              <div className={styles.leftPanelTabBar}>
                <button
                  type="button"
                  className={leftTab === "blocks" ? styles.tabButtonActive : styles.tabButton}
                  onClick={() => setLeftTab("blocks")}
                >
                  Blocks
                </button>
                <button
                  type="button"
                  className={leftTab === "layers" ? styles.tabButtonActive : styles.tabButton}
                  onClick={() => setLeftTab("layers")}
                >
                  Layers
                </button>
                <button
                  type="button"
                  className={leftTab === "library" ? styles.tabButtonActive : styles.tabButton}
                  onClick={() => setLeftTab("library")}
                  data-testid="library-tab-btn"
                >
                  Library
                </button>
              </div>
              <div className={styles.panelBody}>
                {leftTab === "blocks" ? (
                  <PaletteList disabled={!dndEnabled} onInsert={insertFromPaletteAndMaybeClose} />
                ) : leftTab === "layers" ? (
                  <LayerTree canvasBodyRef={canvasBodyRef} />
                ) : (
                  <ComponentLibrary
                    key={libraryVersion}
                    disabled={!dndEnabled}
                    onChanged={() => setLibraryVersion((v) => v + 1)}
                  />
                )}
              </div>
              {/* Resize handle at the right edge of the left panel */}
              <div
                className={styles.resizeHandleRight}
                onMouseDown={startResizeLeft}
                aria-hidden="true"
              />
            </aside>
          ) : null}

          <PageBuilderCanvas
            canvasFrameRef={canvasFrameRef}
            canvasBodyRef={canvasBodyRef}
            focusCanvasFrame={focusCanvasFrame}
            activeDrag={dnd.activeDrag}
            dropIntent={dnd.dropIntent}
            dropInvalid={dnd.dropInvalid}
            dropIndicator={dnd.dropIndicator}
            onAddSection={onAddSection}
            onBrowseTemplates={() => setTemplateGalleryOpen(true)}
            onPreviewFormSubmit={() => pushToast("info", "Form submission is disabled in preview.")}
            onSaveToLibrary={onSaveToLibrary}
            pushToast={pushToast}
          />

          {!isNarrow ? (
            <aside className={styles.panel} aria-label={themeOpen ? "Design Tokens" : "Inspector"} data-tour="inspector">
              {/* Resize handle at the left edge of the right panel */}
              <div
                className={styles.resizeHandleLeft}
                onMouseDown={startResizeRight}
                aria-hidden="true"
              />
              {themeOpen ? (
                <DesignTokensPanel onClose={() => setThemeOpen(false)} />
              ) : (
                <>
                  <div className={styles.panelTitle}>Inspector</div>
                  <div className={styles.panelBody}>
                    <PageBuilderInspector onSaveToLibrary={onSaveToLibrary} />
                  </div>
                </>
              )}
            </aside>
          ) : null}
        </main>

        {isNarrow && mobilePanel === "palette" ? (
          <Drawer title="Blocks & Layers" side="left" onClose={() => setMobilePanel(null)}>
            <div className={styles.leftPanelTabBar}>
              <button
                type="button"
                className={leftTab === "blocks" ? styles.tabButtonActive : styles.tabButton}
                onClick={() => setLeftTab("blocks")}
              >
                Blocks
              </button>
              <button
                type="button"
                className={leftTab === "layers" ? styles.tabButtonActive : styles.tabButton}
                onClick={() => setLeftTab("layers")}
              >
                Layers
              </button>
              <button
                type="button"
                className={leftTab === "library" ? styles.tabButtonActive : styles.tabButton}
                onClick={() => setLeftTab("library")}
              >
                Library
              </button>
            </div>
            {leftTab === "blocks" ? (
              <PaletteList disabled={!dndEnabled} onInsert={insertFromPaletteAndMaybeClose} />
            ) : leftTab === "layers" ? (
              <LayerTree canvasBodyRef={canvasBodyRef} />
            ) : (
              <ComponentLibrary
                key={libraryVersion}
                disabled={!dndEnabled}
                onChanged={() => setLibraryVersion((v) => v + 1)}
              />
            )}
          </Drawer>
        ) : null}

        {isNarrow && mobilePanel === "inspector" ? (
          <Drawer title="Inspector" side="right" onClose={() => setMobilePanel(null)}>
            <PageBuilderInspector onSaveToLibrary={onSaveToLibrary} />
          </Drawer>
        ) : null}

        <ToastHost toasts={toasts} onDismiss={dismissToast} />

        <PageBuilderDialogs
          dialog={dialog}
          onCloseDialog={() => setDialog(null)}
          onToast={pushToast}
          resetOpen={resetOpen}
          onCloseReset={() => setResetOpen(false)}
          onConfirmReset={onConfirmReset}
          renameOpen={renameOpen}
          renameValue={renameValue}
          onRenameValueChange={setRenameValue}
          onCloseRename={() => setRenameOpen(false)}
          onConfirmRename={onConfirmRename}
          recoveryOpen={persistence.recoveryOpen}
          recovery={persistence.recovery}
          docId={persistence.docId}
          onCloseRecovery={() => persistence.setRecoveryOpen(false)}
          onOpenReset={() => setResetOpen(true)}
          onOverwriteSavedAndEnableAutosave={() => {
            void persistence.overwriteSavedAndEnableAutosave();
          }}
          onLoadBackupForRecovery={() => {
            void persistence.loadBackupSnapshotForRecovery();
          }}
        />

        <DragOverlay dropAnimation={prefersReducedMotion ? null : undefined}>
          {dnd.activeDrag?.kind === "palette" ? (
            <PaletteDragPreview nodeType={dnd.activeDrag.nodeType} />
          ) : dnd.activeDrag?.kind === "node" || dnd.activeDrag?.kind === "component" ? (
            <div className={styles.dragOverlay} data-testid="node-drag-overlay">
              {dnd.dragOverlayLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {templateGalleryOpen ? (
        <TemplateGallery
          templates={TEMPLATES}
          onClose={() => setTemplateGalleryOpen(false)}
          onConfirm={(templateId, title) => {
            const tmpl = TEMPLATES.find((t) => t.id === templateId);
            if (!tmpl) return;
            const idFactory = editorStore.getState().idFactory;
            const doc = tmpl.create(idFactory);
            const res = persistence.createDocumentFromTemplate(doc, title);
            if (res.ok) setTemplateGalleryOpen(false);
          }}
        />
      ) : null}

      {tourActive ? (
        <GuidedTour onDone={() => setTourActive(false)} />
      ) : null}

      {commandPaletteOpen ? (
        <CommandPalette
          onClose={() => {
            setCommandPaletteOpen(false);
            focusCanvasFrame();
          }}
          actionContext={{
            pushToast,
            openDialog: setDialog,
            focusCanvasFrame,
          }}
        />
      ) : null}

      {saveToLibraryNodeId ? (
        <SaveToLibraryModal
          defaultName={(() => {
            const state = editorStore.getState();
            const node = state.doc.nodes[saveToLibraryNodeId];
            if (!node) return "Component";
            return getNodeLabel(state.doc, node) || blockRegistry[node.type]?.label || node.type;
          })()}
          onClose={() => setSaveToLibraryNodeId(null)}
          onConfirm={(name, category) => {
            const state = editorStore.getState();
            const node = state.doc.nodes[saveToLibraryNodeId];
            if (!node) {
              setSaveToLibraryNodeId(null);
              return;
            }
            const subtree = cloneSubtree(state.doc, saveToLibraryNodeId);
            const res = saveComponent({ name, category, subtree });
            if (res.ok) {
              pushToast("success", `"${name}" saved to library.`);
              setLibraryVersion((v) => v + 1);
            } else if (res.quota) {
              pushToast("error", "Storage quota exceeded. Delete some components to free space.");
            }
            setSaveToLibraryNodeId(null);
          }}
        />
      ) : null}
    </div>
  );
}
