import { useCallback, useEffect, useState } from "react";

import { useEditorStore } from "@/store";

import styles from "./DesignTokensPanel.module.css";

const COLOR_LABELS: Record<string, string> = {
  background: "Background",
  text: "Text",
  primary: "Primary",
  border: "Border",
};

const FONT_OPTIONS = [
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
  "system-ui",
  "Georgia, 'Times New Roman', serif",
  "Arial, Helvetica, sans-serif",
  "Verdana, Geneva, sans-serif",
  "'Courier New', Courier, monospace",
];

function toHex(value: string): string {
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim())) return value.trim();
  return "#000000";
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className={styles.chevron}>{open ? "▴" : "▾"}</span>
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </div>
  );
}

export function DesignTokensPanel({ onClose }: { onClose: () => void }) {
  const theme = useEditorStore((s) => s.doc.theme);
  const dispatch = useEditorStore((s) => s.dispatch);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateColor = useCallback(
    (key: string, value: string) => {
      dispatch(
        { type: "UPDATE_THEME", patch: { colors: { [key]: value } as Partial<typeof theme.colors> } },
        { coalesceKey: "theme", historyLabel: "Update theme" },
      );
    },
    [dispatch, theme.colors],
  );

  const updateTypography = useCallback(
    (patch: Partial<typeof theme.typography>) => {
      dispatch(
        { type: "UPDATE_THEME", patch: { typography: patch } },
        { coalesceKey: "theme", historyLabel: "Update theme" },
      );
    },
    [dispatch],
  );

  const updateSpacing = useCallback(
    (unit: string) => {
      dispatch(
        { type: "UPDATE_THEME", patch: { spacing: { unit } } },
        { coalesceKey: "theme", historyLabel: "Update theme" },
      );
    },
    [dispatch],
  );

  const baseFontSizePx = parseInt(theme.typography.baseFontSize, 10) || 16;
  const spacingUnitPx = parseInt(theme.spacing.unit, 10) || 4;

  return (
    <div className={styles.panel} role="region" aria-label="Design Tokens">
      <div className={styles.header}>
        <span className={styles.title}>Design Tokens</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close Design Tokens panel"
        >
          ×
        </button>
      </div>

      <div className={styles.body}>
        {/* Colors */}
        <CollapsibleSection title="Colors">
          <div className={styles.colorGrid}>
            {(Object.keys(theme.colors) as Array<keyof typeof theme.colors>).map((key) => {
              const value = theme.colors[key];
              return (
                <div key={key} className={styles.colorRow}>
                  <span className={styles.colorLabel}>{COLOR_LABELS[key] ?? key}</span>
                  <div className={styles.colorInputGroup}>
                    <input
                      type="color"
                      value={toHex(value)}
                      onChange={(e) => updateColor(key, e.target.value)}
                      aria-label={`${COLOR_LABELS[key] ?? key} color picker`}
                      className={styles.colorSwatch}
                    />
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateColor(key, e.target.value)}
                      aria-label={`${COLOR_LABELS[key] ?? key} color value`}
                      className={styles.colorTextInput}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* Typography */}
        <CollapsibleSection title="Typography">
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="dt-font-family">
              Font Family
            </label>
            <input
              id="dt-font-family"
              type="text"
              value={theme.typography.fontFamily}
              onChange={(e) => updateTypography({ fontFamily: e.target.value })}
              className={styles.textInput}
              aria-label="Font family"
              list="dt-font-options"
            />
            <datalist id="dt-font-options">
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="dt-font-size">
              Base Font Size
            </label>
            <div className={styles.numberRow}>
              <input
                id="dt-font-size"
                type="number"
                value={baseFontSizePx}
                min={14}
                max={20}
                step={1}
                onChange={(e) => updateTypography({ baseFontSize: `${e.target.value}px` })}
                className={styles.numberInput}
                aria-label="Base font size in pixels"
              />
              <span className={styles.unit}>px</span>
            </div>
          </div>

          <div
            className={styles.preview}
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: theme.typography.baseFontSize,
            }}
          >
            The quick brown fox jumps over the lazy dog.
          </div>
        </CollapsibleSection>

        {/* Spacing */}
        <CollapsibleSection title="Spacing">
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="dt-spacing-unit">
              Base Unit
            </label>
            <div className={styles.numberRow}>
              <input
                id="dt-spacing-unit"
                type="number"
                value={spacingUnitPx}
                min={2}
                max={16}
                step={1}
                onChange={(e) => updateSpacing(`${e.target.value}px`)}
                className={styles.numberInput}
                aria-label="Spacing unit in pixels"
              />
              <span className={styles.unit}>px</span>
            </div>
          </div>

          <div className={styles.presetRow}>
            {[4, 8, 12].map((px) => (
              <button
                key={px}
                type="button"
                className={theme.spacing.unit === `${px}px` ? styles.presetActive : styles.preset}
                onClick={() => updateSpacing(`${px}px`)}
                aria-pressed={theme.spacing.unit === `${px}px`}
              >
                {px}px
              </button>
            ))}
          </div>

          <div className={styles.spacingScale} aria-label="Spacing scale preview">
            {[1, 2, 4, 6, 8].map((mult) => (
              <div key={mult} className={styles.spacingBar} style={{ width: `calc(var(--space-unit) * ${mult})` }} />
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
