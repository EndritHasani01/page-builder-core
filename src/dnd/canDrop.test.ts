import { describe, expect, test } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";

import { canDrop } from "./canDrop";
import type { DragPayload } from "./types";

describe("canDrop", () => {
  test("allows palette text into a Column", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];
    const columnsId = doc.nodes[sectionId].children[0];
    const firstColumnId = doc.nodes[columnsId].children[0];

    const res = canDrop(doc, { kind: "palette", nodeType: "text" }, { parentId: firstColumnId, index: 0 });
    expect(res.ok).toBe(true);
  });

  test("rejects palette Columns into a Section that already has its layout child", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];

    const res = canDrop(doc, { kind: "palette", nodeType: "columns" }, { parentId: sectionId, index: 1 });
    expect(res.ok).toBe(false);
  });

  test("rejects moving the root Page node", () => {
    const doc = createDefaultDocument();
    const source: DragPayload = { kind: "node", nodeId: doc.rootId };
    const res = canDrop(doc, source, { parentId: doc.rootId, index: 0 });
    expect(res).toEqual({ ok: false, reason: "Cannot move the root node." });
  });

  test("rejects moving a node into its own subtree", () => {
    const doc = createDefaultDocument();
    const idFactory = createDeterministicIdFactory({ startAt: { container: 1 } });

    const columnsId = doc.nodes[doc.nodes[doc.rootId].children[0]].children[0];
    const columnId = doc.nodes[columnsId].children[0];

    const containerA = createNode("container", { idFactory, parentId: columnId });
    const containerB = createNode("container", { idFactory, parentId: containerA.id });
    doc.nodes[containerA.id] = containerA;
    doc.nodes[containerB.id] = containerB;
    doc.nodes[columnId].children.push(containerA.id);
    doc.nodes[containerA.id].children.push(containerB.id);

    const res = canDrop(doc, { kind: "node", nodeId: containerA.id }, { parentId: containerB.id, index: 0 });
    expect(res).toEqual({ ok: false, reason: "Cannot move a node into its own subtree." });
  });

  test("rejects drops into locked containers", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];
    const columnsId = doc.nodes[sectionId].children[0];
    const columnId = doc.nodes[columnsId].children[0];
    doc.nodes[columnId].constraints = { ...doc.nodes[columnId].constraints, locked: true };

    const res = canDrop(doc, { kind: "palette", nodeType: "text" }, { parentId: columnId, index: 0 });
    expect(res.ok).toBe(false);
  });
});
