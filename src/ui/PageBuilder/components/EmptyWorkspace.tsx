import styles from "../PageBuilder.module.css";

export function EmptyWorkspace(props: { onCreatePage: () => void }) {
  return (
    <div className={styles.emptyState} role="status" aria-label="Empty workspace">
      <div className={styles.emptyStateIcon} aria-hidden="true">
        🗂️
      </div>
      <p className={styles.emptyStateTitle}>Welcome to Page Builder</p>
      <p className={styles.emptyStateSubtitle}>
        Create your first page to get started.
      </p>
      <div className={styles.emptyStateActions}>
        <button
          type="button"
          className={styles.emptyStatePrimary}
          onClick={props.onCreatePage}
        >
          + Create Page
        </button>
      </div>
    </div>
  );
}
