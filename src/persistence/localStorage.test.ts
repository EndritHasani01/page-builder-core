import { describe, expect, test, beforeEach } from "vitest";

import { createDefaultDocument } from "@/editor-core";

import { clearLocalStorage, loadBackupFromLocalStorage, loadFromLocalStorage, saveToLocalStorage } from "./localStorage";

describe("persistence/localStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("saveToLocalStorage writes the primary snapshot and rotates the backup", () => {
    const docId = "t";
    const primaryKey = `pb:doc:${docId}`;
    const backupKey = `pb:doc:${docId}:backup`;

    const doc1 = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const doc2 = createDefaultDocument(new Date("2026-02-18T12:30:00.000Z"));

    expect(saveToLocalStorage(docId, doc1).ok).toBe(true);
    expect(window.localStorage.getItem(primaryKey)).not.toBeNull();
    expect(window.localStorage.getItem(backupKey)).toBeNull();

    expect(saveToLocalStorage(docId, doc2).ok).toBe(true);
    const primary = JSON.parse(window.localStorage.getItem(primaryKey) ?? "null") as { meta?: { createdAt?: string } };
    const backup = JSON.parse(window.localStorage.getItem(backupKey) ?? "null") as { meta?: { createdAt?: string } };

    expect(primary.meta?.createdAt).toBe(doc2.meta.createdAt);
    expect(backup.meta?.createdAt).toBe(doc1.meta.createdAt);
  });

  test("loadFromLocalStorage loads the primary snapshot when valid", () => {
    const docId = "t";
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    expect(saveToLocalStorage(docId, doc).ok).toBe(true);

    const loaded = loadFromLocalStorage(docId);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.doc.meta.createdAt).toBe(doc.meta.createdAt);
      expect(loaded.recoveredFromBackup).toBeUndefined();
    }
  });

  test("loadFromLocalStorage recovers from backup when primary is corrupt", () => {
    const docId = "t";
    const primaryKey = `pb:doc:${docId}`;
    const backupKey = `pb:doc:${docId}:backup`;
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    window.localStorage.setItem(primaryKey, "{");
    window.localStorage.setItem(backupKey, JSON.stringify(doc));

    const loaded = loadFromLocalStorage(docId);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.recoveredFromBackup).toBe(true);
      expect(loaded.primaryError?.code).toBe("INVALID_JSON");
      expect(loaded.doc.meta.createdAt).toBe(doc.meta.createdAt);
      expect(loaded.rawPrimary).toBe("{");
    }
  });

  test("loadFromLocalStorage blocks when the primary snapshot is a future schema version, even if a backup exists", () => {
    const docId = "t";
    const primaryKey = `pb:doc:${docId}`;
    const backupKey = `pb:doc:${docId}:backup`;

    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const future = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    (future.meta as Record<string, unknown>).schemaVersion = "9.9.9";

    window.localStorage.setItem(primaryKey, JSON.stringify(future));
    window.localStorage.setItem(backupKey, JSON.stringify(doc));

    const loaded = loadFromLocalStorage(docId);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.code).toBe("FUTURE_VERSION");
      expect(loaded.rawPrimary).toBeTruthy();
      expect(loaded.rawBackup).toBeTruthy();
    }

    const backupLoaded = loadBackupFromLocalStorage(docId);
    expect(backupLoaded.ok).toBe(true);
    if (backupLoaded.ok) {
      expect(backupLoaded.doc.meta.createdAt).toBe(doc.meta.createdAt);
    }
  });

  test("clearLocalStorage removes both primary and backup keys", () => {
    const docId = "t";
    const primaryKey = `pb:doc:${docId}`;
    const backupKey = `pb:doc:${docId}:backup`;

    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    expect(saveToLocalStorage(docId, doc).ok).toBe(true);
    expect(saveToLocalStorage(docId, doc).ok).toBe(true);
    expect(window.localStorage.getItem(primaryKey)).not.toBeNull();
    expect(window.localStorage.getItem(backupKey)).not.toBeNull();

    expect(clearLocalStorage(docId).ok).toBe(true);
    expect(window.localStorage.getItem(primaryKey)).toBeNull();
    expect(window.localStorage.getItem(backupKey)).toBeNull();
  });
});

