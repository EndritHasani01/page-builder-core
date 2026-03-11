import type { IdFactory, Document } from "@/editor-core";
import { LATEST_SCHEMA_VERSION, createDefaultTheme, createNode } from "@/editor-core";

export function createBlankTemplate(idFactory: IdFactory): Document {
  const now = new Date().toISOString();

  const page = createNode("page", { idFactory, props: { title: "Blank Page", lang: "en" } });
  const section = createNode("section", { idFactory, parentId: page.id, props: { variant: "default", fullWidth: false } });
  const columns = createNode("columns", { idFactory, parentId: section.id, props: { columns: 2, gap: "var(--space-4)" } });
  const col1 = createNode("column", { idFactory, parentId: columns.id });
  const col2 = createNode("column", { idFactory, parentId: columns.id });

  page.children = [section.id];
  section.children = [columns.id];
  columns.children = [col1.id, col2.id];

  return {
    meta: { schemaVersion: LATEST_SCHEMA_VERSION, createdAt: now, updatedAt: now, title: "Blank Page" },
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
}
