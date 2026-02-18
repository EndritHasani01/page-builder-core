import { LATEST_SCHEMA_VERSION, migrateToLatest, type Document } from "@/editor-core";

function docKey(docId: string): string {
  return `pb:doc:${docId}`;
}

function backupKey(docId: string): string {
  return `pb:doc:${docId}:backup`;
}

function safeGetItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): { ok: true } | { ok: false; error: string; quota?: boolean } {
  try {
    globalThis.localStorage?.setItem(key, value);
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? "";
    const quota = name === "QuotaExceededError";
    return { ok: false, error: quota ? "Storage quota exceeded." : "Failed to write to LocalStorage.", quota };
  }
}

function safeRemoveItem(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

function readSchemaVersion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = (raw as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const schemaVersion = (meta as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === "string" ? schemaVersion : null;
}

export type LoadResult =
  | { ok: true; doc: Document; recoveredFromBackup?: boolean; migratedFrom?: string }
  | { ok: false; error: string; raw?: string };

export type SaveResult = { ok: true } | { ok: false; error: string; quota?: boolean };

export function loadFromLocalStorage(docId: string): LoadResult {
  const primary = safeGetItem(docKey(docId));
  if (primary === null) return { ok: false, error: "Not found." };

  const primaryRes = parseAndMigrate(primary);
  if (primaryRes.ok) return primaryRes;

  const backup = safeGetItem(backupKey(docId));
  if (backup === null) return { ok: false, error: primaryRes.error, raw: primary };

  const backupRes = parseAndMigrate(backup);
  if (backupRes.ok) return { ...backupRes, recoveredFromBackup: true };

  return { ok: false, error: backupRes.error, raw: primary };
}

function parseAndMigrate(rawText: string): LoadResult {
  try {
    const raw = JSON.parse(rawText) as unknown;
    const from = readSchemaVersion(raw);
    const doc = migrateToLatest(raw);
    const migratedFrom = from && from !== LATEST_SCHEMA_VERSION ? from : undefined;
    return { ok: true, doc, migratedFrom };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON.";
    return { ok: false, error: msg };
  }
}

export function saveToLocalStorage(docId: string, doc: Document): SaveResult {
  const primaryKey = docKey(docId);
  const backup = safeGetItem(primaryKey);
  const next = JSON.stringify(doc, null, 2);

  if (backup !== null) {
    const backupRes = safeSetItem(backupKey(docId), backup);
    if (!backupRes.ok) return backupRes;
  }

  const res = safeSetItem(primaryKey, next);
  if (!res.ok) return res;

  return { ok: true };
}

export function clearLocalStorage(docId: string): { ok: true } | { ok: false; error: string } {
  try {
    safeRemoveItem(docKey(docId));
    safeRemoveItem(backupKey(docId));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to clear LocalStorage.";
    return { ok: false, error: msg };
  }
}

