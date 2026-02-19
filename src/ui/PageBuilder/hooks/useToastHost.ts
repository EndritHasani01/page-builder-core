import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "info" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

export type ToastHostApi = {
  toasts: Toast[];
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
};

export function useToastHost(opts?: { timeoutMs?: number }): ToastHostApi {
  const timeoutMs = opts?.timeoutMs ?? 4500;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `t_${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id, kind, message }]);
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, timeoutMs);
      timers.current.set(id, timer);
    },
    [timeoutMs],
  );

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      for (const timer of timersMap.values()) {
        window.clearTimeout(timer);
      }
      timersMap.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}
