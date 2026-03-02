import { useState } from "react";

import type { StyleProps } from "@/editor-core";

import styles from "../PageBuilder.module.css";

type BoxSide = "top" | "right" | "bottom" | "left";
type BoxArea = "padding" | "margin";

function toStyleKey(area: BoxArea, side: BoxSide): keyof StyleProps {
  const s = side.charAt(0).toUpperCase() + side.slice(1);
  return `${area}${s}` as keyof StyleProps;
}

// ─── SideValue (module-level to avoid remount on every BoxModelEditor render) ──

interface SideValueProps {
  area: BoxArea;
  side: BoxSide;
  active: { area: BoxArea; side: BoxSide } | null;
  inputValue: string;
  disabled?: boolean;
  currentValue: string;
  onActivate: (area: BoxArea, side: BoxSide) => void;
  onInputChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function SideValue({
  area,
  side,
  active,
  inputValue,
  disabled,
  currentValue,
  onActivate,
  onInputChange,
  onBlur,
  onKeyDown,
}: SideValueProps) {
  const isActive = active?.area === area && active?.side === side;
  const label = `${area} ${side}`;

  if (isActive) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        className={styles.boxModelInput}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        aria-label={label}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.boxModelSideBtn}
      onClick={() => onActivate(area, side)}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {currentValue}
    </button>
  );
}

// ─── BoxModelEditor ───────────────────────────────────────────────────────────

interface BoxModelEditorProps {
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  blockLabel: string;
  disabled?: boolean;
  onPatchStyle: (patch: Partial<StyleProps>) => void;
}

export function BoxModelEditor(props: BoxModelEditorProps) {
  const [active, setActive] = useState<{ area: BoxArea; side: BoxSide } | null>(null);
  const [inputValue, setInputValue] = useState("");

  const getValue = (area: BoxArea, side: BoxSide): string => {
    const key = toStyleKey(area, side);
    const v = props[key as keyof BoxModelEditorProps];
    return typeof v === "string" ? v : "–";
  };

  const handleActivate = (area: BoxArea, side: BoxSide) => {
    if (props.disabled) return;
    const key = toStyleKey(area, side);
    const v = props[key as keyof BoxModelEditorProps];
    setInputValue(typeof v === "string" ? v : "");
    setActive({ area, side });
  };

  const handleCommit = () => {
    if (!active) return;
    const key = toStyleKey(active.area, active.side);
    const val = inputValue.trim();
    props.onPatchStyle({ [key]: val || undefined } as Partial<StyleProps>);
    setActive(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCommit();
    if (e.key === "Escape") setActive(null);
  };

  const commonProps = {
    active,
    inputValue,
    disabled: props.disabled,
    onActivate: handleActivate,
    onInputChange: setInputValue,
    onBlur: handleCommit,
    onKeyDown: handleKeyDown,
  };

  return (
    <div className={styles.boxModel} aria-label="Box model editor">
      {/* Margin top */}
      <div className={styles.boxModelEdgeRow}>
        <SideValue {...commonProps} area="margin" side="top" currentValue={getValue("margin", "top")} />
      </div>

      {/* Middle row: marginLeft | padding zone | marginRight */}
      <div className={styles.boxModelMiddleRow}>
        <div className={styles.boxModelEdgeCol}>
          <SideValue {...commonProps} area="margin" side="left" currentValue={getValue("margin", "left")} />
        </div>

        {/* Padding zone */}
        <div className={styles.boxModelPaddingZone}>
          {/* Padding top */}
          <div className={styles.boxModelEdgeRow}>
            <SideValue {...commonProps} area="padding" side="top" currentValue={getValue("padding", "top")} />
          </div>

          {/* Inner row: paddingLeft | content | paddingRight */}
          <div className={styles.boxModelMiddleRow}>
            <div className={styles.boxModelEdgeCol}>
              <SideValue {...commonProps} area="padding" side="left" currentValue={getValue("padding", "left")} />
            </div>
            <div className={styles.boxModelContent} aria-label="Content area">
              {props.blockLabel}
            </div>
            <div className={styles.boxModelEdgeCol}>
              <SideValue {...commonProps} area="padding" side="right" currentValue={getValue("padding", "right")} />
            </div>
          </div>

          {/* Padding bottom */}
          <div className={styles.boxModelEdgeRow}>
            <SideValue {...commonProps} area="padding" side="bottom" currentValue={getValue("padding", "bottom")} />
          </div>
        </div>

        <div className={styles.boxModelEdgeCol}>
          <SideValue {...commonProps} area="margin" side="right" currentValue={getValue("margin", "right")} />
        </div>
      </div>

      {/* Margin bottom */}
      <div className={styles.boxModelEdgeRow}>
        <SideValue {...commonProps} area="margin" side="bottom" currentValue={getValue("margin", "bottom")} />
      </div>
    </div>
  );
}
