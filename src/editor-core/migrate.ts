import { LATEST_SCHEMA_VERSION } from "./constants";
import type { Document } from "./types";
import { safeParseDocument } from "./schema";
import { normalizeDocument } from "./normalize";

export type MigrateErrorCode =
  | "INVALID_JSON"
  | "MISSING_SCHEMA_VERSION"
  | "UNSUPPORTED_VERSION"
  | "FUTURE_VERSION"
  | "SCHEMA_INVALID";

export class DocumentMigrationError extends Error {
  readonly code: MigrateErrorCode;
  readonly details?: unknown;

  constructor(code: MigrateErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type Migration = {
  from: string;
  to: string;
  migrate: (raw: unknown) => unknown;
};

const MIGRATIONS: Migration[] = [];

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

function readSchemaVersion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = (raw as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return null;
  const schemaVersion = (meta as Record<string, unknown>).schemaVersion;
  return typeof schemaVersion === "string" ? schemaVersion : null;
}

export function migrateToLatest(raw: unknown): Document {
  const schemaVersion = readSchemaVersion(raw);

  if (typeof schemaVersion !== "string") {
    throw new DocumentMigrationError(
      "MISSING_SCHEMA_VERSION",
      "Document meta.schemaVersion is missing or invalid.",
    );
  }

  let currentVersion = schemaVersion;
  let currentRaw: unknown = raw;

  if (currentVersion !== LATEST_SCHEMA_VERSION) {
    const cmp = compareSemver(currentVersion, LATEST_SCHEMA_VERSION);
    if (cmp !== null && cmp > 0) {
      throw new DocumentMigrationError(
        "FUTURE_VERSION",
        `Document schema version ${currentVersion} is newer than supported ${LATEST_SCHEMA_VERSION}.`,
      );
    }

    while (currentVersion !== LATEST_SCHEMA_VERSION) {
      const migration = MIGRATIONS.find((m) => m.from === currentVersion);
      if (!migration) {
        throw new DocumentMigrationError(
          "UNSUPPORTED_VERSION",
          `Unsupported schema version: ${currentVersion}.`,
        );
      }
      currentRaw = migration.migrate(currentRaw);
      const nextVersion = readSchemaVersion(currentRaw);
      if (!nextVersion || nextVersion !== migration.to) {
        throw new DocumentMigrationError(
          "UNSUPPORTED_VERSION",
          `Migration from ${migration.from} did not produce expected version ${migration.to}.`,
        );
      }
      currentVersion = nextVersion;
    }
  }

  const parsed = safeParseDocument(currentRaw);
  if (!parsed.success) {
    throw new DocumentMigrationError("SCHEMA_INVALID", "Document schema validation failed.", parsed.error);
  }

  return normalizeDocument(parsed.data);
}
