import { describe, expect, test } from "vitest";

import { applyCommand, createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";

describe("applyCommand", () => {
  test("returns changed=false and an error issue for invalid parent", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, { type: "ADD_NODE", parentId: "missing", nodeType: "text" });

    expect(res.changed).toBe(false);
    expect(res.issues.some((i) => i.level === "error")).toBe(true);
  });

  test("rejects ADD_NODE into a locked parent", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    doc.nodes.column_1.constraints = { locked: true };

    const res = applyCommand(doc, { type: "ADD_NODE", parentId: "column_1", nodeType: "text", id: "text_1" });

    expect(res.changed).toBe(false);
    expect(res.doc.nodes.text_1).toBeUndefined();
    expect(res.issues.some((i) => i.level === "error" && i.nodeId === "column_1")).toBe(true);
  });

  test("prevents moving a node into its own subtree", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    // Build a small container under column_1 and try to move column_1 into it.
    const withContainer = applyCommand(doc, {
      type: "ADD_NODE",
      parentId: "column_1",
      nodeType: "container",
      id: "container_1",
    }).doc;

    const res = applyCommand(withContainer, {
      type: "MOVE_NODE",
      nodeId: "column_1",
      parentId: "container_1",
      index: 0,
    });

    expect(res.changed).toBe(false);
    expect(res.issues.some((i) => i.message.includes("subtree"))).toBe(true);
  });

  test("returns changed=false for a no-op MOVE_NODE within the same parent", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const withText = applyCommand(doc, { type: "ADD_NODE", parentId: "column_1", nodeType: "text", id: "text_1" }).doc;

    const res = applyCommand(withText, { type: "MOVE_NODE", nodeId: "text_1", parentId: "column_1", index: 0 });
    expect(res.changed).toBe(false);
    expect(res.doc.nodes.column_1.children).toEqual(["text_1"]);
  });

  test("rejects MOVE_NODE into Columns directly (non-column)", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const withText = applyCommand(doc, { type: "ADD_NODE", parentId: "column_1", nodeType: "text", id: "text_1" }).doc;

    const res = applyCommand(withText, { type: "MOVE_NODE", nodeId: "text_1", parentId: "columns_1", index: 0 });
    expect(res.changed).toBe(false);
    expect(res.issues.some((i) => i.message.toLowerCase().includes("columns"))).toBe(true);
  });

  test("rejects DELETE_NODE for required structural children", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    const res = applyCommand(doc, { type: "DELETE_NODE", nodeId: "columns_1" });

    expect(res.changed).toBe(false);
    expect(res.doc.nodes.columns_1).toBeDefined();
    expect(res.issues.some((i) => i.message.toLowerCase().includes("required"))).toBe(true);
  });

  test("DUPLICATE_NODE deep clones a subtree with new ids", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const withContainer = applyCommand(doc, { type: "ADD_NODE", parentId: "column_1", nodeType: "container", id: "container_1" }).doc;
    const withChild = applyCommand(withContainer, { type: "ADD_NODE", parentId: "container_1", nodeType: "text", id: "text_1" }).doc;

    const res = applyCommand(
      withChild,
      { type: "DUPLICATE_NODE", nodeId: "container_1" },
      { idFactory: createDeterministicIdFactory({ startAt: { container: 10, text: 10 } }) },
    );

    expect(res.changed).toBe(true);
    expect(res.doc.nodes.container_10?.type).toBe("container");
    expect(res.doc.nodes.text_10?.type).toBe("text");
    expect(res.doc.nodes.column_1.children).toEqual(["container_1", "container_10"]);
    expect(res.doc.nodes.container_10.parentId).toBe("column_1");
    expect(res.doc.nodes.container_10.children).toEqual(["text_10"]);
    expect(res.doc.nodes.text_10.parentId).toBe("container_10");
  });

  test("UPDATE_PROPS is blocked for locked nodes", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const lockedText = createNode("text", { id: "text_1", parentId: "column_1", constraints: { locked: true } });
    doc.nodes[lockedText.id] = lockedText;
    doc.nodes.column_1.children = [lockedText.id];

    const res = applyCommand(doc, { type: "UPDATE_PROPS", nodeId: "text_1", patch: { content: [{ text: "Nope" }] } });
    expect(res.changed).toBe(false);
    expect(res.doc.nodes.text_1?.type).toBe("text");
    if (res.doc.nodes.text_1?.type === "text") {
      expect(res.doc.nodes.text_1.props.content[0]?.text).toBe("Text");
    }
    expect(res.issues.some((i) => i.message.toLowerCase().includes("locked"))).toBe(true);
  });

  test("UPDATE_STYLE writes to the requested breakpoint and deletes keys when undefined", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    const res1 = applyCommand(doc, {
      type: "UPDATE_STYLE",
      nodeId: "column_1",
      breakpoint: "md",
      patch: { padding: "var(--space-4)", opacity: 0.8 },
    });

    expect(res1.doc.nodes.column_1.style?.md?.padding).toBe("var(--space-4)");
    expect(res1.doc.nodes.column_1.style?.md?.opacity).toBe(0.8);

    const res2 = applyCommand(res1.doc, {
      type: "UPDATE_STYLE",
      nodeId: "column_1",
      breakpoint: "md",
      patch: { padding: undefined },
    });

    expect(res2.doc.nodes.column_1.style?.md?.padding).toBeUndefined();
    expect(res2.doc.nodes.column_1.style?.md?.opacity).toBe(0.8);
  });

  test("UPDATE_META updates the document meta title", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, { type: "UPDATE_META", patch: { title: "Renamed" } });
    expect(res.changed).toBe(true);
    expect(res.doc.meta.title).toBe("Renamed");
  });

  test("RESET_STYLE_BREAKPOINT clears the breakpoint override bucket", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    const withStyles = applyCommand(doc, {
      type: "UPDATE_STYLE",
      nodeId: "column_1",
      breakpoint: "base",
      patch: { padding: "8px" },
    }).doc;

    const withMd = applyCommand(withStyles, {
      type: "UPDATE_STYLE",
      nodeId: "column_1",
      breakpoint: "md",
      patch: { padding: "12px", color: "red" },
    }).doc;

    expect(withMd.nodes.column_1.style?.md?.padding).toBe("12px");

    const cleared = applyCommand(withMd, {
      type: "RESET_STYLE_BREAKPOINT",
      nodeId: "column_1",
      breakpoint: "md",
    }).doc;

    expect(cleared.nodes.column_1.style?.md).toBeUndefined();
    expect(cleared.nodes.column_1.style?.base.padding).toBe("8px");
  });

  test("UPDATE_THEME deep-merges color patch without clobbering other tokens", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const originalText = doc.theme.colors.text;
    const originalBorder = doc.theme.colors.border;

    const res = applyCommand(doc, {
      type: "UPDATE_THEME",
      patch: { colors: { primary: "#ff0000" } },
    });

    expect(res.changed).toBe(true);
    expect(res.doc.theme.colors.primary).toBe("#ff0000");
    expect(res.doc.theme.colors.text).toBe(originalText);
    expect(res.doc.theme.colors.border).toBe(originalBorder);
  });

  test("UPDATE_THEME updates typography and spacing independently", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    const withFont = applyCommand(doc, {
      type: "UPDATE_THEME",
      patch: { typography: { baseFontSize: "18px" } },
    }).doc;

    expect(withFont.theme.typography.baseFontSize).toBe("18px");
    expect(withFont.theme.typography.fontFamily).toBe(doc.theme.typography.fontFamily);

    const withUnit = applyCommand(withFont, {
      type: "UPDATE_THEME",
      patch: { spacing: { unit: "8px" } },
    }).doc;

    expect(withUnit.theme.spacing.unit).toBe("8px");
    expect(withUnit.theme.typography.baseFontSize).toBe("18px");
  });

  test("UPDATE_THEME rejects an invalid CSS color", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const originalPrimary = doc.theme.colors.primary;

    const res = applyCommand(doc, {
      type: "UPDATE_THEME",
      patch: { colors: { primary: "not-a-color-12345" } },
    });

    expect(res.changed).toBe(false);
    expect(res.doc.theme.colors.primary).toBe(originalPrimary);
    expect(res.issues.some((i) => i.level === "error")).toBe(true);
  });

  test("UPDATE_THEME rejects an empty font family", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));

    const res = applyCommand(doc, {
      type: "UPDATE_THEME",
      patch: { typography: { fontFamily: "   " } },
    });

    expect(res.changed).toBe(false);
    expect(res.issues.some((i) => i.level === "error")).toBe(true);
  });

  test("UPDATE_META stores description, ogTitle, and ogImage in doc.meta", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, {
      type: "UPDATE_META",
      patch: {
        description: "A short description",
        ogTitle: "Open Graph Title",
        ogImage: "https://example.com/og.png",
      },
    });

    expect(res.changed).toBe(true);
    expect(res.doc.meta.description).toBe("A short description");
    expect(res.doc.meta.ogTitle).toBe("Open Graph Title");
    expect(res.doc.meta.ogImage).toBe("https://example.com/og.png");
    expect(res.issues).toHaveLength(0);
  });

  test("UPDATE_META emits a warning for an unsafe URL in ogImage but still stores it", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, {
      type: "UPDATE_META",
      patch: { ogImage: "javascript:alert(1)" },
    });

    expect(res.changed).toBe(true);
    expect(res.doc.meta.ogImage).toBe("javascript:alert(1)");
    expect(res.issues.some((i) => i.level === "warning" && i.fieldPath === "ogImage")).toBe(true);
  });

  test("UPDATE_META stores slug, canonicalUrl, and headSnippet", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, {
      type: "UPDATE_META",
      patch: {
        slug: "my-page",
        canonicalUrl: "https://example.com/my-page",
        headSnippet: '<meta name="robots" content="noindex">',
      },
    });

    expect(res.changed).toBe(true);
    expect(res.doc.meta.slug).toBe("my-page");
    expect(res.doc.meta.canonicalUrl).toBe("https://example.com/my-page");
    expect(res.doc.meta.headSnippet).toBe('<meta name="robots" content="noindex">');
  });
});
