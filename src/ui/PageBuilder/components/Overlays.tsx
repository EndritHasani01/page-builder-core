import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

import styles from "../PageBuilder.module.css";

function focusElement(el: HTMLElement | null) {
  if (!el) return;
  if (typeof document !== "undefined" && !document.contains(el)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=\"hidden\"])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex=\"-1\"])",
    "[contenteditable=\"true\"]",
  ];

  return Array.from(root.querySelectorAll<HTMLElement>(selectors.join(","))).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

export function Drawer(props: { title: string; side: "left" | "right"; children: React.ReactNode; onClose: () => void }) {
  const { title, side, children, onClose } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusElement(rootRef.current);
    return () => focusElement(returnFocusRef.current);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        focusElement(root);
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!active || active === root || !root.contains(active)) {
        e.preventDefault();
        focusElement(e.shiftKey ? last : first);
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          focusElement(last);
        }
      } else {
        if (active === last) {
          e.preventDefault();
          focusElement(first);
        }
      }
    },
    [rootRef],
  );

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
        onKeyDown={onKeyDown}
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

export function Modal(props: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { title, children, onClose } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusElement(rootRef.current);
    return () => focusElement(returnFocusRef.current);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        focusElement(root);
        return;
      }

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!active || active === root || !root.contains(active)) {
        e.preventDefault();
        focusElement(e.shiftKey ? last : first);
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          focusElement(last);
        }
      } else {
        if (active === last) {
          e.preventDefault();
          focusElement(first);
        }
      }
    },
    [rootRef],
  );

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
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

