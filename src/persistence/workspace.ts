import { z } from "zod";

import { nanoid } from "nanoid";

import { createDefaultDocument, deepClone, type Document } from "@/editor-core";

import { clearLocalStorage, loadFromLocalStorage, saveToLocalStorage, type LoadResult, type SaveResult } from "./localStorage";

const WORKSPACE_INDEX_KEY = "pb:index:v1";
const WORKSPACE_ACTIVE_DOC_KEY = "pb:activeDocId";

const WorkspaceDocMetaSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type WorkspaceDocMeta = z.infer<typeof WorkspaceDocMetaSchema>;

const WorkspaceIndexSchema = z
  .object({
    version: z.literal(1),
    docs: z.array(WorkspaceDocMetaSchema),
  })
  .strict();

type WorkspaceIndex = z.infer<typeof WorkspaceIndexSchema>;

function safeGetItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): SaveResult {
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

function asIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function sortDocsNewerFirst(docs: WorkspaceDocMeta[]): WorkspaceDocMeta[] {
  return docs
    .slice()
    .sort((a, b) => {
      const aMs = Date.parse(a.updatedAt);
      const bMs = Date.parse(b.updatedAt);
      if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) return bMs - aMs;
      return a.id.localeCompare(b.id);
    });
}

function normalizeIndex(index: WorkspaceIndex): WorkspaceIndex {
  const byId = new Map<string, WorkspaceDocMeta>();

  for (const raw of index.docs) {
    const id = raw.id.trim();
    if (!id) continue;

    const title = typeof raw.title === "string" ? raw.title : "";
    const createdAt = asIsoDateOrNull(raw.createdAt) ?? new Date(0).toISOString();
    const updatedAt = asIsoDateOrNull(raw.updatedAt) ?? createdAt;

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, title, createdAt, updatedAt });
      continue;
    }

    // Keep the entry with the newer updatedAt and the most recent title.
    const existingMs = Date.parse(existing.updatedAt);
    const nextMs = Date.parse(updatedAt);

    if (Number.isFinite(existingMs) && Number.isFinite(nextMs) && nextMs > existingMs) {
      byId.set(id, { id, title, createdAt: existing.createdAt, updatedAt });
    } else if (title && title !== existing.title) {
      byId.set(id, { ...existing, title });
    }
  }

  return { version: 1, docs: sortDocsNewerFirst(Array.from(byId.values())) };
}

function readIndex(): WorkspaceIndex {
  const raw = safeGetItem(WORKSPACE_INDEX_KEY);
  if (raw === null) return { version: 1, docs: [] };

  try {
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = WorkspaceIndexSchema.safeParse(parsedJson);
    if (!parsed.success) return { version: 1, docs: [] };
    return normalizeIndex(parsed.data);
  } catch {
    return { version: 1, docs: [] };
  }
}

function writeIndex(index: WorkspaceIndex): SaveResult {
  const normalized = normalizeIndex(index);
  return safeSetItem(WORKSPACE_INDEX_KEY, JSON.stringify(normalized, null, 2));
}

export function listWorkspaceDocuments(): WorkspaceDocMeta[] {
  return readIndex().docs;
}

export function upsertWorkspaceDocumentMeta(meta: WorkspaceDocMeta): SaveResult {
  const index = readIndex();
  const nextDocs = index.docs.filter((d) => d.id !== meta.id);
  nextDocs.push(meta);
  return writeIndex({ version: 1, docs: nextDocs });
}

export function removeWorkspaceDocumentMeta(docId: string): SaveResult {
  const index = readIndex();
  const nextDocs = index.docs.filter((d) => d.id !== docId);
  return writeIndex({ version: 1, docs: nextDocs });
}

export function getActiveWorkspaceDocId(): string | null {
  const raw = safeGetItem(WORKSPACE_ACTIVE_DOC_KEY);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function setActiveWorkspaceDocId(docId: string): void {
  const trimmed = docId.trim();
  if (!trimmed) return;
  void safeSetItem(WORKSPACE_ACTIVE_DOC_KEY, trimmed);
}

export function clearActiveWorkspaceDocId(): void {
  safeRemoveItem(WORKSPACE_ACTIVE_DOC_KEY);
}

function docMetaFromDocument(docId: string, doc: Document, updatedAt: string): WorkspaceDocMeta {
  const createdAt =
    typeof doc.meta?.createdAt === "string" && asIsoDateOrNull(doc.meta.createdAt)
      ? doc.meta.createdAt
      : new Date(0).toISOString();

  const title = typeof doc.meta?.title === "string" ? doc.meta.title : "";

  return {
    id: docId,
    title,
    createdAt,
    updatedAt,
  };
}

export function ensureWorkspaceEntryForDocument(docId: string, doc: Document): SaveResult {
  const index = readIndex();
  const existing = index.docs.find((d) => d.id === docId);
  if (existing) {
    // Keep timestamps stable on load. Only reconcile title.
    if (existing.title === doc.meta.title) return { ok: true };
    const next = index.docs.map((d) => (d.id === docId ? { ...d, title: doc.meta.title } : d));
    return writeIndex({ version: 1, docs: next });
  }

  const createdAt = asIsoDateOrNull(doc.meta.createdAt) ?? new Date().toISOString();
  const updatedAt = asIsoDateOrNull(doc.meta.updatedAt) ?? createdAt;
  const meta: WorkspaceDocMeta = { id: docId, title: doc.meta.title, createdAt, updatedAt };
  return upsertWorkspaceDocumentMeta(meta);
}

function nextDocId(): string {
  return `doc_${nanoid(10)}`;
}

function isDocIdAvailable(docId: string): boolean {
  const key = `pb:doc:${docId}`;
  return safeGetItem(key) === null;
}

function generateAvailableDocId(): string {
  for (let i = 0; i < 5; i++) {
    const id = nextDocId();
    if (isDocIdAvailable(id)) return id;
  }
  // If we are extremely unlucky, just return a longer id.
  return `doc_${nanoid(16)}`;
}

export function createWorkspaceDocument(opts?: { docId?: string; now?: Date; title?: string; doc?: Document }): {
  ok: true;
  docId: string;
  doc: Document;
} | {
  ok: false;
  error: string;
  quota?: boolean;
} {
  const desiredId = opts?.docId?.trim() || null;
  const docId = desiredId && isDocIdAvailable(desiredId) ? desiredId : generateAvailableDocId();
  const now = opts?.now ?? new Date();

  const doc = opts?.doc ? deepClone(opts.doc) : createDefaultDocument(now);
  if (opts?.title && opts.title.trim()) {
    doc.meta.title = opts.title.trim();
  }
  doc.meta.updatedAt = now.toISOString();

  const saved = saveToLocalStorage(docId, doc, { rotateBackup: false });
  if (!saved.ok) return saved;

  const updatedAt = now.toISOString();
  const meta = docMetaFromDocument(docId, doc, updatedAt);
  const indexed = upsertWorkspaceDocumentMeta(meta);
  if (!indexed.ok) return indexed;

  setActiveWorkspaceDocId(docId);
  return { ok: true, docId, doc };
}

export function duplicateWorkspaceDocument(source: Document, opts?: { now?: Date; title?: string }): {
  ok: true;
  docId: string;
  doc: Document;
} | {
  ok: false;
  error: string;
  quota?: boolean;
} {
  const now = opts?.now ?? new Date();
  const docId = generateAvailableDocId();

  const doc = deepClone(source);
  const baseTitle =
    typeof opts?.title === "string" && opts.title.trim()
      ? opts.title.trim()
      : typeof doc.meta.title === "string" && doc.meta.title.trim()
        ? doc.meta.title.trim()
        : "Untitled";

  doc.meta.title = `${baseTitle} (Copy)`;
  doc.meta.createdAt = now.toISOString();
  doc.meta.updatedAt = doc.meta.createdAt;

  const saved = saveToLocalStorage(docId, doc, { rotateBackup: false });
  if (!saved.ok) return saved;

  const updatedAt = now.toISOString();
  const meta = docMetaFromDocument(docId, doc, updatedAt);
  const indexed = upsertWorkspaceDocumentMeta(meta);
  if (!indexed.ok) return indexed;

  setActiveWorkspaceDocId(docId);
  return { ok: true, docId, doc };
}

export function saveWorkspaceDocument(docId: string, doc: Document, opts?: { rotateBackup?: boolean }): SaveResult {
  const res = saveToLocalStorage(docId, doc, opts);
  if (!res.ok) return res;

  const updatedAt = new Date().toISOString();
  const meta = docMetaFromDocument(docId, doc, updatedAt);
  const indexed = upsertWorkspaceDocumentMeta(meta);
  if (!indexed.ok) return indexed;

  return { ok: true };
}

export function loadWorkspaceDocument(docId: string): LoadResult {
  const loaded = loadFromLocalStorage(docId);
  if (loaded.ok) {
    void ensureWorkspaceEntryForDocument(docId, loaded.doc);
    setActiveWorkspaceDocId(docId);
  }
  return loaded;
}

export function deleteWorkspaceDocument(docId: string): { ok: true } | { ok: false; error: string } {
  const cleared = clearLocalStorage(docId);
  if (!cleared.ok) return cleared;
  void removeWorkspaceDocumentMeta(docId);
  return { ok: true };
}

