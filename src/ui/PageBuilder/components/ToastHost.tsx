import type { Toast, ToastVariant } from "../hooks/useToastHost";

import styles from "../PageBuilder.module.css";

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "i",
  action: "●",
};

export function ToastHost(props: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (props.toasts.length === 0) return null;

  return (
    <div className={styles.toastHost} aria-live="polite" aria-label="Notifications">
      {props.toasts.map((t) => (
        <div
          key={t.id}
          className={styles.toastItem}
          role="status"
          data-state={t.animState}
          data-variant={t.variant}
        >
          <div className={styles.toastIcon} data-variant={t.variant} aria-hidden="true">
            {ICONS[t.variant]}
          </div>

          <div className={styles.toastBody}>
            <div className={styles.toastMessage}>{t.message}</div>

            {t.action ? (
              <button
                type="button"
                className={styles.toastActionBtn}
                onClick={() => {
                  t.action!.onClick();
                  props.onDismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}

            {t.progress !== undefined ? (
              <div className={styles.toastProgressBar} role="progressbar" aria-valuenow={Math.round(t.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={styles.toastProgressFill}
                  style={{ width: `${Math.round(t.progress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={styles.toastClose}
            onClick={() => props.onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
