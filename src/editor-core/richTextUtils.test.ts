import { describe, expect, test } from "vitest";

import { createDefaultDocument, createDefaultTheme, createNode, createDeterministicIdFactory, migrateToLatest } from "@/editor-core";
import { richContentToPlainText, plainTextToRichContent, mergeAdjacentSegments } from "./richTextUtils";

describe("richContentToPlainText", () => {
  test("concatenates all segment texts", () => {
    expect(
      richContentToPlainText([{ text: "Hello " }, { text: "world", bold: true }]),
    ).toBe("Hello world");
  });

  test("returns empty string for empty content", () => {
    expect(richContentToPlainText([{ text: "" }])).toBe("");
  });

  test("handles single plain segment", () => {
    expect(richContentToPlainText([{ text: "Only text" }])).toBe("Only text");
  });
});

describe("plainTextToRichContent", () => {
  test("creates a single plain segment", () => {
    expect(plainTextToRichContent("Hello")).toEqual([{ text: "Hello" }]);
  });

  test("creates a segment for empty string", () => {
    expect(plainTextToRichContent("")).toEqual([{ text: "" }]);
  });
});

describe("mergeAdjacentSegments", () => {
  test("merges adjacent segments with identical marks", () => {
    const result = mergeAdjacentSegments([
      { text: "Hello", bold: true },
      { text: " world", bold: true },
      { text: "!", italic: true },
    ]);
    expect(result).toEqual([
      { text: "Hello world", bold: true },
      { text: "!", italic: true },
    ]);
  });

  test("does not merge segments with different marks", () => {
    const result = mergeAdjacentSegments([
      { text: "a", bold: true },
      { text: "b", italic: true },
    ]);
    expect(result).toEqual([
      { text: "a", bold: true },
      { text: "b", italic: true },
    ]);
  });

  test("merges plain segments with no marks", () => {
    const result = mergeAdjacentSegments([{ text: "a" }, { text: "b" }, { text: "c" }]);
    expect(result).toEqual([{ text: "abc" }]);
  });

  test("does not merge segments with different link hrefs", () => {
    const result = mergeAdjacentSegments([
      { text: "a", link: { href: "https://a.com" } },
      { text: "b", link: { href: "https://b.com" } },
    ]);
    expect(result).toHaveLength(2);
  });

  test("merges segments with the same link href", () => {
    const result = mergeAdjacentSegments([
      { text: "Hello", link: { href: "https://x.com" } },
      { text: " there", link: { href: "https://x.com" } },
    ]);
    expect(result).toEqual([{ text: "Hello there", link: { href: "https://x.com" } }]);
  });

  test("returns a single empty segment for empty input", () => {
    const result = mergeAdjacentSegments([]);
    expect(result).toEqual([{ text: "" }]);
  });
});

describe("migration 1.0.0 → 1.1.0", () => {
  const baseTheme = createDefaultTheme();

  test("converts text node props.text to props.content array", () => {
    const raw100 = {
      meta: {
        schemaVersion: "1.0.0",
        createdAt: "2026-02-18T12:00:00.000Z",
        updatedAt: "2026-02-18T12:00:00.000Z",
        title: "Migration Test",
      },
      theme: baseTheme,
      rootId: "page_1",
      nodes: {
        page_1: {
          id: "page_1",
          type: "page",
          parentId: null,
          children: ["section_1"],
          props: { title: "Test", lang: "en" },
        },
        section_1: {
          id: "section_1",
          type: "section",
          parentId: "page_1",
          children: ["columns_1"],
          props: { variant: "default", fullWidth: false },
        },
        columns_1: {
          id: "columns_1",
          type: "columns",
          parentId: "section_1",
          children: ["column_1", "column_2"],
          props: { columns: 2, gap: "16px" },
        },
        column_1: {
          id: "column_1",
          type: "column",
          parentId: "columns_1",
          children: ["text_1"],
          props: {},
        },
        column_2: {
          id: "column_2",
          type: "column",
          parentId: "columns_1",
          children: [],
          props: {},
        },
        text_1: {
          id: "text_1",
          type: "text",
          parentId: "column_1",
          children: [],
          props: { text: "Hello world", as: "p" },
        },
      },
    };

    const migrated = migrateToLatest(raw100);
    const textNode = migrated.nodes["text_1"];
    expect(textNode).toBeDefined();
    expect(textNode.type).toBe("text");
    if (textNode.type === "text") {
      expect(textNode.props.content).toEqual([{ text: "Hello world" }]);
      expect(textNode.props.as).toBe("p");
      expect((textNode.props as Record<string, unknown>).text).toBeUndefined();
    }
  });

  test("produces a document at schema version 1.2.0", () => {
    const raw100 = {
      meta: {
        schemaVersion: "1.0.0",
        createdAt: "2026-02-18T12:00:00.000Z",
        updatedAt: "2026-02-18T12:00:00.000Z",
        title: "Migration Test",
      },
      theme: baseTheme,
      rootId: "page_1",
      nodes: {
        page_1: {
          id: "page_1",
          type: "page",
          parentId: null,
          children: [],
          props: { title: "Test", lang: "en" },
        },
      },
    };

    const migrated = migrateToLatest(raw100);
    expect(migrated.meta.schemaVersion).toBe("1.2.0");
  });

  test("tooLarge flag: a 1.2.0 document passes through unchanged", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory({ startAt: { text: 5 } });
    const textNode = createNode("text", {
      idFactory,
      parentId: "column_1",
      props: { content: [{ text: "Already migrated" }] },
    });
    doc.nodes[textNode.id] = textNode;
    doc.nodes.column_1.children = [textNode.id];

    const migrated = migrateToLatest(doc);
    expect(migrated.meta.schemaVersion).toBe("1.2.0");
    expect(migrated.nodes[textNode.id]?.type).toBe("text");
  });
});
