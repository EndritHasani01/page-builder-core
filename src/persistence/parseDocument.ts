import {
  DocumentMigrationError,
  LATEST_SCHEMA_VERSION,
  migrateToLatest,
  type Document,
  type MigrateErrorCode,
} from "@/editor-core";

function readSchemaVersion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = (raw as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const schemaVersion = (meta as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === "string" ? schemaVersion : null;
}

export type ParseDocumentErrorCode = "INVALID_JSON" | "UNKNOWN_ERROR" | MigrateErrorCode;

export type ParseDocumentResult =
  | { ok: true; doc: Document; migratedFrom?: string }
  | { ok: false; code: ParseDocumentErrorCode; error: string; details?: unknown };

export function parseDocumentJsonText(rawText: string): ParseDocumentResult {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON.";
    return { ok: false, code: "INVALID_JSON", error: msg };
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

