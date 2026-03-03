import { useDraggable } from "@dnd-kit/core";

import type { NodeType } from "@/editor-core";
import { blockRegistry } from "@/editor-core";
import type { DragPayload } from "@/dnd";
import { paletteDragId } from "@/dnd";

import styles from "../PageBuilder.module.css";

const PALETTE_GROUPS: { label: string; types: NodeType[] }[] = [
  {
    label: "Layout",
    types: ["section", "columns", "container"],
  },
  {
    label: "Content",
    types: ["text", "image", "button", "spacer", "divider"],
  },
  {
    label: "Forms",
    types: ["form", "textInput", "textarea", "selectInput", "checkbox", "radioGroup", "submitButton"],
  },
];

export function PaletteList(props: { disabled: boolean; onInsert: (nodeType: NodeType) => void }) {
  return (
    <ul className={styles.paletteList} aria-disabled={props.disabled}>
      {PALETTE_GROUPS.map((group) => (
        <li key={group.label} className={styles.paletteGroup}>
          <div className={styles.paletteGroupLabel}>{group.label}</div>
          <ul className={styles.paletteGroupItems}>
            {group.types.map((type) => (
              <PaletteListItem
                key={type}
                block={blockRegistry[type]}
                disabled={props.disabled}
                onInsert={props.onInsert}
              />
            ))}
          </ul>
        </li>
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
