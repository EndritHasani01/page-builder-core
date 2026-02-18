import type { Document } from "@/editor-core";
import type { EditorStore } from "@/store";

import { saveToLocalStorage, type SaveResult } from "./localStorage";

export type PersistenceStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: number }
  | { state: "error"; error: string; quota?: boolean };

export function startAutosave(
  store: EditorStore,
  docId: string,
  opts?: {
    debounceMs?: number;
    onStatus?: (status: PersistenceStatus) => void;
    shouldSave?: (doc: Document) => boolean;
  },
): () => void {
  const debounceMs = opts?.debounceMs ?? 600;
  const onStatus = opts?.onStatus;
  const shouldSave = opts?.shouldSave ?? (() => true);

  let timer: number | null = null;
  let blocked = false;

  const flush = (doc: Document) => {
    if (blocked) return;
    if (!shouldSave(doc)) return;
    onStatus?.({ state: "saving" });

    const res: SaveResult = saveToLocalStorage(docId, doc);
    if (!res.ok) {
      blocked = Boolean(res.quota);
      onStatus?.({ state: "error", error: res.error, quota: res.quota });
      return;
    }
    onStatus?.({ state: "saved", at: Date.now() });
  };

  const unsubscribe = store.subscribe(
    (s) => s.doc,
    (doc) => {
      if (blocked) return;
      if (!shouldSave(doc)) return;
      onStatus?.({ state: "saving" });
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => flush(doc), debounceMs);
    },
    { equalityFn: Object.is },
  );

  return () => {
    if (timer !== null) window.clearTimeout(timer);
    unsubscribe();
  };
}

