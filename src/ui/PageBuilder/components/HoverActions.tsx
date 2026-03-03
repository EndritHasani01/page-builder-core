import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { NodeId } from "@/editor-core";

import styles from "./HoverActions.module.css";

export function HoverActions({
  hoveredId,
  onDuplicate,
  onDelete,
}: {
  hoveredId: NodeId;
  onDuplicate: (id: NodeId) => void;
  onDelete: (id: NodeId) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-node-id="${hoveredId}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [hoveredId]);

  if (!rect) return null;

  const top = rect.top + 4;
  const right = window.innerWidth - rect.right + 4;

  const toolbar = (
    <div
      className={styles.toolbar}
      style={{ top, right }}
      role="toolbar"
      aria-label="Block quick actions"
      // Prevent mousedown from firing blur/hover-out on the canvas node before click
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={styles.btn}
        title="Duplicate"
        aria-label="Duplicate block"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(hoveredId);
        }}
      >
        ⧉
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnDanger}`}
        title="Delete"
        aria-label="Delete block"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(hoveredId);
        }}
      >
        ✕
      </button>
    </div>
  );

  return createPortal(toolbar, document.body);
}
