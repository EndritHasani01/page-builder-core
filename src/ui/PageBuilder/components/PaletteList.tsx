import { useDraggable } from "@dnd-kit/core";

import type { NodeType } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import type { DragPayload } from "@/dnd";
import { paletteDragId } from "@/dnd";

import styles from "../PageBuilder.module.css";

export function PaletteList(props: { disabled: boolean; onInsert: (nodeType: NodeType) => void }) {
  return (
    <ul className={styles.paletteList} aria-disabled={props.disabled}>
      {Object.values(blockRegistry)
        .filter((b) => b.type !== "page" && b.type !== "column")
        .map((b) => (
          <PaletteListItem key={b.type} block={b} disabled={props.disabled} onInsert={props.onInsert} />
        ))}
    </ul>
  );
}

function PaletteListItem(props: {
  block: (typeof blockRegistry)[NodeType];
  disabled: boolean;
  onInsert: (nodeType: NodeType) => void;
}) {
  const draggable = useDraggable({
    id: paletteDragId(props.block.type),
    disabled: props.disabled,
    data: { kind: "palette", nodeType: props.block.type } satisfies DragPayload,
  });
  const { attributes, listeners, setActivatorNodeRef, setNodeRef } = draggable;

  return (
    <li
      ref={setNodeRef}
      className={styles.paletteItem}
      data-palette-block-type={props.block.type}
      data-dnd-palette-item="true"
    >
      <button
        type="button"
        className={styles.paletteButton}
        disabled={props.disabled}
        onClick={() => props.onInsert(props.block.type)}
      >
        {props.block.label}
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.paletteDragHandle}
        disabled={props.disabled}
        aria-label={`Drag ${props.block.label}`}
        data-dnd-handle="true"
        {...attributes}
        {...listeners}
      >
        Drag
      </button>
    </li>
  );
}

