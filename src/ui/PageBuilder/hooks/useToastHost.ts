import { useCallback, useEffect, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info" | "action";

/** @deprecated use ToastVariant */
export type ToastKind = ToastVariant;

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
  /** Progress value 0–1; renders a progress bar along the bottom of the toast. */
  progress?: number;
  /** Internal animation state. */
  animState: "entering" | "visible" | "exiting";
};

export type ToastHostApi = {
  toasts: Toast[];
  pushToast: (
    variant: ToastVariant,
    message: string,
    opts?: { action?: ToastAction; progress?: number },
  ) => string;
  updateToastProgress: (id: string, progress: number) => void;
  dismissToast: (id: string) => void;
};

/** Maximum number of simultaneously visible toasts. */
const MAX_VISIBLE = 3;

/** Auto-dismiss timeout per variant in ms; null = no auto-dismiss. */
const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  success: 3000,
  info: 4000,
  error: null, // persists until the user closes it
  action: null, // persists until dismissed or action button is clicked
};

export function useToastHost(): ToastHostApi {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissTimers = useRef(new Map<string, number>());
  const animTimers = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const dt = dismissTimers.current.get(id);
    if (dt !== undefined) {
      window.clearTimeout(dt);
      dismissTimers.current.delete(id);
    }
    // Transition to exiting state, then remove after the CSS animation completes.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, animState: "exiting" } : t)));
    const removeTimer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      animTimers.current.delete(`${id}_exit`);
    }, 200);
    animTimers.current.set(`${id}_exit`, removeTimer);
  }, []);

  const pushToast = useCallback(
    (
      variant: ToastVariant,
      message: string,
      opts?: { action?: ToastAction; progress?: number },
    ): string => {
      const id = `t_${Math.random().toString(16).slice(2)}`;
      const newToast: Toast = {
        id,
        variant,
        message,
        action: opts?.action,
        progress: opts?.progress,
        animState: "entering",
      };

      setToasts((prev) => {
        let next = [...prev, newToast];
        // If over the cap, auto-dismiss the oldest dismissable (success/info) toast.
        if (next.filter((t) => t.animState !== "exiting").length > MAX_VISIBLE) {
          const oldest = next.find(
            (t) =>
              (t.variant === "success" || t.variant === "info") && t.animState !== "exiting",
          );
          if (oldest) {
            window.setTimeout(() => dismissToast(oldest.id), 0);
          } else {
            // All are non-dismissable; trim the oldest from display.
            next = next.slice(-MAX_VISIBLE);
          }
        }
        return next;
      });

      // After one animation frame, switch to "visible" so the CSS transition fires.
      const enterTimer = window.setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, animState: "visible" } : t)),
        );
        animTimers.current.delete(`${id}_enter`);
      }, 16);
      animTimers.current.set(`${id}_enter`, enterTimer);

      // Schedule auto-dismiss if applicable.
      const dismissMs = AUTO_DISMISS_MS[variant];
      if (dismissMs !== null) {
        const timer = window.setTimeout(() => dismissToast(id), dismissMs);
        dismissTimers.current.set(id, timer);
      }

      return id;
    },
    [dismissToast],
  );

  const updateToastProgress = useCallback((id: string, progress: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, progress } : t)),
    );
  }, []);

  // Cleanup all timers on unmount.
  useEffect(() => {
    const dt = dismissTimers.current;
    const at = animTimers.current;
    return () => {
      for (const timer of dt.values()) window.clearTimeout(timer);
      for (const timer of at.values()) window.clearTimeout(timer);
      dt.clear();
      at.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast, updateToastProgress };
}
