import { LATEST_SCHEMA_VERSION } from "./constants";
import type { Document, Theme } from "./types";
import { createDeterministicIdFactory } from "./ids";
import { createNode } from "./nodeFactory";

export function createDefaultTheme(): Theme {
  return {
    colors: {
      background: "#ffffff",
      text: "#111827",
      primary: "#2563eb",
      border: "#e5e7eb",
    },
    typography: {
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
      baseFontSize: "16px",
      scale: 1.2,
    },
    spacing: { unit: "4px" },
    breakpoints: { sm: 640, md: 768, lg: 1024 },
  };
}

export function createDefaultDocument(now: Date = new Date()): Document {
  const idFactory = createDeterministicIdFactory();
  const createdAt = now.toISOString();

  const page = createNode("page", { idFactory });
  const section = createNode("section", { idFactory, parentId: page.id });
  const columns = createNode("columns", { idFactory, parentId: section.id });
  const col1 = createNode("column", { idFactory, parentId: columns.id });
  const col2 = createNode("column", { idFactory, parentId: columns.id });

  page.children = [section.id];
  section.children = [columns.id];
  columns.children = [col1.id, col2.id];

  const doc: Document = {
    meta: {
      schemaVersion: LATEST_SCHEMA_VERSION,
      createdAt,
      updatedAt: createdAt,
      title: "Untitled",
    },
    theme: createDefaultTheme(),
    rootId: page.id,
    nodes: {
      [page.id]: page,
      [section.id]: section,
      [columns.id]: columns,
      [col1.id]: col1,
      [col2.id]: col2,
    },
  };

  return doc;
}

