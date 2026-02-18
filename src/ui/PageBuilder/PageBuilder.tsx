import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

import styles from "./PageBuilder.module.css";

type Mode = "edit" | "preview";
type Breakpoint = "sm" | "md" | "lg";

export function PageBuilder() {
  const [mode, setMode] = useState<Mode>("edit");
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg");

  const themeStyle = useMemo(() => {
    return {
      "--color-bg": "#ffffff",
      "--color-text": "#111827",
      "--color-primary": "#2563eb",
      "--color-border": "#e5e7eb",
      "--space-4": "16px",
    } as CSSProperties;
  }, []);

  return (
    <div className={styles.themeRoot} style={themeStyle}>
      <header className={styles.toolbar}>
        <h1 className={styles.brand}>Page Builder</h1>
        <div className={styles.controls}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="edit">Edit</option>
              <option value="preview">Preview</option>
            </select>
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>Breakpoint</span>
            <select value={breakpoint} onChange={(e) => setBreakpoint(e.target.value as Breakpoint)}>
              <option value="lg">Desktop</option>
              <option value="md">Tablet</option>
              <option value="sm">Mobile</option>
            </select>
          </label>

          <button className={styles.button} type="button" disabled>
            Undo
          </button>
          <button className={styles.button} type="button" disabled>
            Redo
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <aside className={styles.panel} aria-label="Palette">
          <div className={styles.panelTitle}>Palette</div>
          <div className={styles.panelBody}>
            <p className={styles.muted}>
              This will list blocks from the registry and support click-to-insert and drag-and-drop.
            </p>
            <p className={styles.muted}>In preview mode, palette interactions will be disabled.</p>
          </div>
        </aside>

        <section className={styles.canvas} aria-label="Canvas">
          <div className={styles.canvasFrame} data-mode={mode} data-bp={breakpoint} tabIndex={0}>
            <div className={styles.canvasTitle}>Canvas ({mode})</div>
            <div className={styles.canvasBody}>
              <p className={styles.muted}>
                The document renderer will mount here. This is a placeholder editor shell for wiring
                the core subsystems.
              </p>
            </div>
          </div>
        </section>

        <aside className={styles.panel} aria-label="Inspector">
          <div className={styles.panelTitle}>Inspector</div>
          <div className={styles.panelBody}>
            <p className={styles.muted}>
              This will render an inspector form for the selected node (content and style tabs).
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

