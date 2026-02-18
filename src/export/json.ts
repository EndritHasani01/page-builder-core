import type { Document } from "@/editor-core";

import type { JsonExportResult } from "./types";

export function exportDocumentToJson(doc: Document): JsonExportResult {
  return { json: JSON.stringify(doc, null, 2) };
}

