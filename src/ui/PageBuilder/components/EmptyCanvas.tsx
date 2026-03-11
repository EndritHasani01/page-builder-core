import styles from "../PageBuilder.module.css";

export function EmptyCanvas(props: { onAddSection: () => void; onBrowseTemplates?: () => void }) {
  return (
    <div className={styles.emptyState} role="status" aria-label="Empty canvas">
      <div className={styles.emptyStateIcon} aria-hidden="true">
        📄
      </div>
      <p className={styles.emptyStateTitle}>Start building your page</p>
      <p className={styles.emptyStateSubtitle}>
        Drag a block from the palette or add a section to get started.
      </p>
      <div className={styles.emptyStateActions}>
        <button
          type="button"
          className={styles.emptyStatePrimary}
          onClick={props.onAddSection}
        >
          Add Section
        </button>
        {props.onBrowseTemplates ? (
          <button
            type="button"
            className={styles.emptyStateSecondary}
            onClick={props.onBrowseTemplates}
          >
            Browse Templates
          </button>
        ) : null}
      </div>
    </div>
  );
}
