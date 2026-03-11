import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./ContextMenu.module.css";

export type ContextMenuSeparator = { kind: "separator" };

export type ContextMenuAction = {
  kind: "action";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  action: () => void;
};

export type ContextMenuItem = ContextMenuSeparator | ContextMenuAction;

export type ContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  // After first render, clamp to viewport so menu doesn't overflow edges.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = y + rect.height > vh ? Math.max(0, y - rect.height) : y;
    const left = x + rect.width > vw ? Math.max(0, x - rect.width) : x;
    setPos({ top, left });
  }, [x, y]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onScroll = () => onClose();

    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ top: pos.top, left: pos.left }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.kind === "separator") {
          return <div key={i} className={styles.separator} role="separator" />;
        }
        const isDisabled = Boolean(item.disabled);
        return (
          <button
            key={i}
            type="button"
            className={[
              styles.item,
              item.danger ? styles.itemDanger : "",
              isDisabled ? styles.itemDisabled : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="menuitem"
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) {
                item.action();
                onClose();
              }
            }}
          >
            <span className={styles.itemLabel}>{item.label}</span>
            {item.shortcut ? (
              <span className={styles.itemShortcut}>{item.shortcut}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
}
