import styles from "../PageBuilder.module.css";

/** Shown when the component library tab has no saved components. */
export function EmptyLibrary() {
  return (
    <div className={styles.emptyState} role="status" aria-label="Empty component library">
      <div className={styles.emptyStateIcon} aria-hidden="true">
        🧩
      </div>
      <p className={styles.emptyStateTitle}>No saved components</p>
      <p className={styles.emptyStateSubtitle}>
        Your saved components will appear here. Select a block and use &ldquo;Save to Library&rdquo; to start your collection.
      </p>
    </div>
  );
}
