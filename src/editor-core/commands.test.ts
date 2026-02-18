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
});

