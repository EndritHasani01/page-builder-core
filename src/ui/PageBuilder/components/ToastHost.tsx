import type { Toast } from "../hooks/useToastHost";

import styles from "../PageBuilder.module.css";

export function ToastHost(props: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (props.toasts.length === 0) return null;

  return (
    <div className={styles.toastHost} aria-live="polite" aria-label="Notifications">
      {props.toasts.map((t) => (
        <div key={t.id} className={t.kind === "error" ? styles.toastError : styles.toast} role="status">
          <div className={styles.toastMessage}>{t.message}</div>
          <button type="button" className={styles.toastClose} onClick={() => props.onDismiss(t.id)} aria-label="Dismiss">
            x
          </button>
        </div>
      ))}
    </div>
  );
}

