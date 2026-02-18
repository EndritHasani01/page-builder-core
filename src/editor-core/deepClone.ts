export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // `structuredClone` cannot clone some values (for example, Immer drafts / Proxies).
      // Our persisted document model is JSON-serializable, so falling back is acceptable.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
