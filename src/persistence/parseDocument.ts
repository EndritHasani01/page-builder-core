import {
  DocumentMigrationError,
  LATEST_SCHEMA_VERSION,
  migrateToLatest,
  type Document,
  type MigrateErrorCode,
} from "@/editor-core";

export const MAX_DOCUMENT_JSON_CHARS = 2_000_000;
export const MAX_DOCUMENT_NODES = 5_000;

function readSchemaVersion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = (raw as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const schemaVersion = (meta as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === "string" ? schemaVersion : null;
}

function maybeReadNodeCount(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const nodes = (raw as Record<string, unknown>).nodes;
  if (!nodes || typeof nodes !== "object") return null;
  if (Array.isArray(nodes)) return null;
  return Object.keys(nodes as Record<string, unknown>).length;
}

export type ParseDocumentErrorCode = "INVALID_JSON" | "UNKNOWN_ERROR" | "DOCUMENT_TOO_LARGE" | MigrateErrorCode;

export type ParseDocumentResult =
  | { ok: true; doc: Document; migratedFrom?: string }
  | { ok: false; code: ParseDocumentErrorCode; error: string; details?: unknown };

export function parseDocumentJsonText(rawText: string): ParseDocumentResult {
  if (rawText.length > MAX_DOCUMENT_JSON_CHARS) {
    return {
      ok: false,
      code: "DOCUMENT_TOO_LARGE",
      error: `Document JSON is too large (${rawText.length} chars). Limit is ${MAX_DOCUMENT_JSON_CHARS}.`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON.";
    return { ok: false, code: "INVALID_JSON", error: msg };
  }

  const nodeCount = maybeReadNodeCount(raw);
  if (nodeCount !== null && nodeCount > MAX_DOCUMENT_NODES) {
    return {
      ok: false,
      code: "DOCUMENT_TOO_LARGE",
      error: `Document is too large (${nodeCount} nodes). Limit is ${MAX_DOCUMENT_NODES}.`,
    };
  }

  const from = readSchemaVersion(raw);

  try {
    const doc = migrateToLatest(raw);
    const migratedFrom = from && from !== LATEST_SCHEMA_VERSION ? from : undefined;
    return { ok: true, doc, migratedFrom };
  } catch (e) {
    if (e instanceof DocumentMigrationError) {
      return { ok: false, code: e.code, error: e.message, details: e.details };
    }
    const msg = e instanceof Error ? e.message : "Failed to parse document.";
    return { ok: false, code: "UNKNOWN_ERROR", error: msg };
  }
}
