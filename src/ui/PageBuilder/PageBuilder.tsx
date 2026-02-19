import type { CSSProperties } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { DndContext, DragOverlay } from "@dnd-kit/core";

import type { NodeType } from "@/editor-core";
import { themeToCssVars } from "@/renderer";
import { editorStore, useEditorStore } from "@/store";
import { useMediaQuery } from "@/ui/hooks/useMediaQuery";

import { Drawer } from "./components/Overlays";
import { PageBuilderCanvas } from "./components/PageBuilderCanvas";
import { PageBuilderDialogs } from "./components/PageBuilderDialogs";
import { PageBuilderInspector } from "./components/PageBuilderInspector";
import { PageBuilderToolbar } from "./components/PageBuilderToolbar";
import { PaletteList } from "./components/PaletteList";
import { ToastHost } from "./components/ToastHost";
import { usePageBuilderDnd } from "./hooks/usePageBuilderDnd";
import {
  type PageBuilderDialog,
  type PageBuilderMobilePanel,
  usePageBuilderKeyboardShortcuts,
} from "./hooks/usePageBuilderKeyboardShortcuts";
import { usePageBuilderPersistence } from "./hooks/usePageBuilderPersistence";
import { usePaletteInsertion } from "./hooks/usePaletteInsertion";
import { useToastHost } from "./hooks/useToastHost";

import styles from "./PageBuilder.module.css";

export function PageBuilder() {
  const { toasts, pushToast, dismissToast } = useToastHost();

  const persistence = usePageBuilderPersistence({ pushToast });

  const [inspectorTab, setInspectorTab] = useState<"content" | "style">("content");
  const [dialog, setDialog] = useState<PageBuilderDialog>(null);
  const [mobilePanel, setMobilePanel] = useState<PageBuilderMobilePanel>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

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
    activeDrag: dnd.activeDrag,
    setDialog,
    setMobilePanel,
    setResetOpen,
    setRecoveryOpen: persistence.setRecoveryOpen,
    pushToast,
    focusCanvasFrame,
  });

  const insertFromPaletteAndMaybeClose = useCallback(
    (nodeType: NodeType) => {
      insertFromPalette(nodeType);
      if (isNarrow) setMobilePanel(null);
    },
    [insertFromPalette, isNarrow],
  );

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

  return (
    <div className={styles.themeRoot} style={themeStyle}>
      <DndContext {...dnd.dndContextProps}>
        <PageBuilderToolbar
          docId={persistence.docId}
          workspaceDocs={persistence.workspaceDocs}
          onSwitchDocument={onSwitchDocument}
          onCreateNewDocument={() => {
            void persistence.createNewDocument();
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
          isNarrow={isNarrow}
          dialog={dialog}
          setDialog={setDialog}
          mobilePanel={mobilePanel}
          setMobilePanel={setMobilePanel}
        />

        <main className={styles.main} data-narrow={isNarrow ? "true" : "false"}>
          {!isNarrow ? (
            <aside className={styles.panel} aria-label="Palette">
              <div className={styles.panelTitle}>Palette</div>
              <div className={styles.panelBody}>
                <PaletteList disabled={!dndEnabled} onInsert={insertFromPaletteAndMaybeClose} />
              </div>
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
          />

          {!isNarrow ? (
            <aside className={styles.panel} aria-label="Inspector">
              <div className={styles.panelTitle}>Inspector</div>
              <div className={styles.panelBody}>
                <PageBuilderInspector tab={inspectorTab} onTabChange={setInspectorTab} />
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
            <PageBuilderInspector tab={inspectorTab} onTabChange={setInspectorTab} />
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
          {dnd.activeDrag ? <div className={styles.dragOverlay}>{dnd.dragOverlayLabel}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

