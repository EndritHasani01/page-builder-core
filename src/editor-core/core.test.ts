import { describe, expect, test } from "vitest";

import {
  DocumentSchema,
  cloneSubtree,
  createDefaultDocument,
  createDeterministicIdFactory,
  createNode,
  migrateToLatest,
  normalizeDocument,
  remapIds,
} from "@/editor-core";

describe("editor-core", () => {
  test("createDefaultDocument produces a schema-valid document", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const parsed = DocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  test("normalizeDocument repairs a section missing a Columns layout", () => {
    const idFactory = createDeterministicIdFactory();
    const page = createNode("page", { idFactory });
    const section = createNode("section", { idFactory, parentId: page.id });
    const strayText = createNode("text", { idFactory, parentId: section.id });

    page.children = [section.id];
    section.children = [strayText.id];

    const doc = {
      meta: {
        schemaVersion: "1.0.0" as const,
        createdAt: "2026-02-18T12:00:00.000Z",
        updatedAt: "2026-02-18T12:00:00.000Z",
        title: "Test",
      },
      theme: createDefaultDocument().theme,
      rootId: page.id,
      nodes: {
        [page.id]: page,
        [section.id]: section,
        [strayText.id]: strayText,
      },
    };

    const normalized = normalizeDocument(doc);
    const sectionAfter = normalized.nodes[section.id];
    expect(sectionAfter.type).toBe("section");
    expect(sectionAfter.children).toHaveLength(1);
    expect(normalized.nodes[sectionAfter.children[0]]?.type).toBe("columns");
  });

  test("cloneSubtree + remapIds remaps ids and rewrites relationships", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const subtree = cloneSubtree(doc, doc.rootId);
    const remapped = remapIds(subtree, createDeterministicIdFactory({ startAt: { page: 100 } }));

    expect(remapped.rootId).not.toBe(subtree.rootId);
    expect(Object.keys(remapped.nodes).length).toBe(Object.keys(subtree.nodes).length);

    const root = remapped.nodes[remapped.rootId];
    expect(root.parentId).toBeNull();
    expect(root.children.length).toBeGreaterThan(0);
    for (const childId of root.children) {
      expect(remapped.nodes[childId]?.parentId).toBe(root.id);
    }
  });

  test("migrateToLatest rejects newer schema versions", () => {
    expect(() =>
      migrateToLatest({
        meta: { schemaVersion: "9.0.0" },
      }),
    ).toThrow();
  });
});

