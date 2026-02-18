import { describe, expect, test } from "vitest";

import { applyCommand, createDefaultDocument } from "@/editor-core";

describe("applyCommand", () => {
  test("returns changed=false and an error issue for invalid parent", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = applyCommand(doc, { type: "ADD_NODE", parentId: "missing", nodeType: "text" });

    expect(res.changed).toBe(false);
    expect(res.issues.some((i) => i.level === "error")).toBe(true);
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
});
