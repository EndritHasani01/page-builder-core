import { useEffect, useRef, useState } from "react";

import styles from "./DragTooltip.module.css";

/**
 * A cursor-following tooltip that appears when a drag is over an invalid target.
 * Renders with `position: fixed` so it escapes all scroll/overflow containers.
 */
export function DragTooltip({ reason }: { reason: string | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!reason) {
      activeRef.current = false;
      setPos(null);
      return;
    }
    activeRef.current = true;

    const onMove = (e: MouseEvent) => {
      if (!activeRef.current) return;
      setPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
    };
  }, [reason]);

  if (!reason || !pos) return null;

  // Keep tooltip within viewport
  const OFFSET = 16;
  const tooltipW = 260;
  const left = Math.min(pos.x + OFFSET, window.innerWidth - tooltipW - 8);
  const top = pos.y + OFFSET;

  return (
    <div
      className={styles.tooltip}
      style={{ left, top }}
      role="tooltip"
      data-testid="drag-tooltip-invalid"
      aria-live="polite"
    >
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {reason}
    </div>
  );
}
