import type { Document } from "@/editor-core";

import { parseDocumentJsonText, type ParseDocumentErrorCode } from "./parseDocument";

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

export type LoadResult =
  | {
      ok: true;
      doc: Document;
      migratedFrom?: string;
      recoveredFromBackup?: boolean;
      primaryError?: { code: ParseDocumentErrorCode; error: string };
      rawPrimary?: string;
    }
  | { ok: false; error: string; code: "NOT_FOUND" | ParseDocumentErrorCode; rawPrimary?: string; rawBackup?: string };

export type SaveResult = { ok: true } | { ok: false; error: string; quota?: boolean };

export function loadFromLocalStorage(docId: string): LoadResult {
  const primary = safeGetItem(docKey(docId));
  if (primary === null) return { ok: false, code: "NOT_FOUND", error: "Not found." };

  const primaryRes = parseDocumentJsonText(primary);
  if (primaryRes.ok) return primaryRes;

  const backup = safeGetItem(backupKey(docId));

  if (primaryRes.code === "FUTURE_VERSION") {
    return {
      ok: false,
      code: primaryRes.code,
      error: primaryRes.error,
      rawPrimary: primary,
      rawBackup: backup ?? undefined,
    };
  }

  if (backup === null) {
    return { ok: false, code: primaryRes.code, error: primaryRes.error, rawPrimary: primary };
  }

  const backupRes = parseDocumentJsonText(backup);
  if (backupRes.ok) {
    return {
      ok: true,
      doc: backupRes.doc,
      migratedFrom: backupRes.migratedFrom,
      recoveredFromBackup: true,
      primaryError: { code: primaryRes.code, error: primaryRes.error },
      rawPrimary: primary,
    };
  }

  return {
    ok: false,
    code: backupRes.code,
    error: backupRes.error,
    rawPrimary: primary,
    rawBackup: backup,
  };
}

export function loadBackupFromLocalStorage(docId: string): LoadResult {
  const backup = safeGetItem(backupKey(docId));
  if (backup === null) return { ok: false, code: "NOT_FOUND", error: "Not found." };

  return parseDocumentJsonText(backup);
}

export function saveToLocalStorage(docId: string, doc: Document, opts?: { rotateBackup?: boolean }): SaveResult {
  const primaryKey = docKey(docId);
  const next = JSON.stringify(doc, null, 2);

  const prevPrimary = opts?.rotateBackup === false ? null : safeGetItem(primaryKey);

  const res = safeSetItem(primaryKey, next);
  if (!res.ok) return res;

  if (prevPrimary !== null) {
    // Best-effort backup rotation. Primary already written.
    safeSetItem(backupKey(docId), prevPrimary);
  }

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
