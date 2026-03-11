import type { NodeType } from "@/editor-core";

import styles from "./PaletteDragPreview.module.css";

/**
 * Schematic drag preview card for palette items.
 * Shown in the DragOverlay when dragging from the palette panel.
 */
export function PaletteDragPreview({ nodeType }: { nodeType: NodeType }) {
  switch (nodeType) {
    case "text":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Text</div>
          <div className={styles.textLines}>
            <div className={styles.textLine} />
            <div className={styles.textLine} />
            <div className={`${styles.textLine} ${styles.textLineShort}`} />
          </div>
        </div>
      );

    case "image":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Image</div>
          <div className={styles.imagePlaceholder}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="7" cy="7.5" r="1.5" fill="currentColor" />
              <path d="M2 13l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      );

    case "button":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Button</div>
          <div className={styles.buttonShape}>Click me</div>
        </div>
      );

    case "section":
      return (
        <div className={`${styles.card} ${styles.sectionCard}`} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Section</div>
          <div className={styles.sectionStripes}>
            <div className={styles.sectionStripe} />
            <div className={`${styles.sectionStripe} ${styles.sectionStripeNarrow}`} />
            <div className={styles.sectionStripe} />
          </div>
        </div>
      );

    case "columns":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Columns</div>
          <div className={styles.columnsRow}>
            <div className={styles.columnStub} />
            <div className={styles.columnStub} />
          </div>
        </div>
      );

    case "container":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Container</div>
          <div className={styles.containerBox} />
        </div>
      );

    case "spacer":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Spacer</div>
          <div className={styles.spacerVisual}>↕</div>
        </div>
      );

    case "divider":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Divider</div>
          <div className={styles.dividerVisual} />
        </div>
      );

    case "video":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Video</div>
          <div className={styles.videoPlaceholder}>
            <svg className={styles.playIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 8.5l6 3.5-6 3.5V8.5z" fill="currentColor" />
            </svg>
          </div>
        </div>
      );

    case "embed":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Embed</div>
          <div className={styles.embedPlaceholder}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 4L2 8l4 4M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Embed
          </div>
        </div>
      );

    case "icon":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Icon</div>
          <div className={styles.iconPlaceholder}>★</div>
        </div>
      );

    case "form":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Form</div>
          <div className={styles.formCardInner}>
            <div className={styles.inputShape} />
            <div className={styles.inputShape} />
            <div className={styles.submitBtnShape}>Submit</div>
          </div>
        </div>
      );

    case "textInput":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Text Input</div>
          <div className={styles.inputShape} />
        </div>
      );

    case "textarea":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Textarea</div>
          <div className={styles.textareaShape} />
        </div>
      );

    case "selectInput":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Select</div>
          <div className={styles.inputShape} />
        </div>
      );

    case "checkbox":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Checkbox</div>
          <div className={styles.checkboxRow}>
            <div className={styles.checkboxShape} />
            <div className={styles.checkboxLabel} />
          </div>
        </div>
      );

    case "radioGroup":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Radio Group</div>
          <div className={styles.radioRow}>
            <div className={styles.radioOption}>
              <div className={styles.radioDot} />
              <div className={styles.radioLine} />
            </div>
            <div className={styles.radioOption}>
              <div className={styles.radioDot} />
              <div className={styles.radioLine} />
            </div>
          </div>
        </div>
      );

    case "submitButton":
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>Submit</div>
          <div className={styles.submitBtnShape}>Submit</div>
        </div>
      );

    default:
      return (
        <div className={styles.card} data-testid={`palette-preview-${nodeType}`}>
          <div className={styles.cardLabel}>{nodeType}</div>
        </div>
      );
  }
}
