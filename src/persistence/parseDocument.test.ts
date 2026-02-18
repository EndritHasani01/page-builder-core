import { describe, expect, test } from "vitest";

import { createDefaultDocument } from "@/editor-core";

import { parseDocumentJsonText } from "./parseDocument";

describe("parseDocumentJsonText", () => {
  test("returns INVALID_JSON for malformed JSON", () => {
    const res = parseDocumentJsonText("{");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("INVALID_JSON");
    }
  });

  test("parses a valid document", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = parseDocumentJsonText(JSON.stringify(doc));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.doc.meta.schemaVersion).toBe("1.0.0");
      expect(res.doc.meta.createdAt).toBe(doc.meta.createdAt);
    }
  });

  test("returns MISSING_SCHEMA_VERSION when meta.schemaVersion is absent", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const raw = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    const meta = raw.meta as Record<string, unknown>;
    delete meta.schemaVersion;

    const res = parseDocumentJsonText(JSON.stringify(raw));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("MISSING_SCHEMA_VERSION");
    }
  });

  test("returns FUTURE_VERSION when schemaVersion is newer than supported", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const raw = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    (raw.meta as Record<string, unknown>).schemaVersion = "9.9.9";

    const res = parseDocumentJsonText(JSON.stringify(raw));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("FUTURE_VERSION");
    }
  });

  test("returns UNSUPPORTED_VERSION when schemaVersion is older with no migration path", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const raw = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    (raw.meta as Record<string, unknown>).schemaVersion = "0.9.0";

    const res = parseDocumentJsonText(JSON.stringify(raw));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("UNSUPPORTED_VERSION");
    }
  });
});

