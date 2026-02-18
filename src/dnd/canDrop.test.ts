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

  test("rejects dropping non-Column blocks into Columns directly", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];
    const columnsId = doc.nodes[sectionId].children[0];

    const res = canDrop(doc, { kind: "palette", nodeType: "text" }, { parentId: columnsId, index: 0 });
    expect(res).toEqual({ ok: false, reason: "Cannot insert into Columns directly." });
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

  test("rejects moving managed Columns out of a Section", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];
    const columnsId = doc.nodes[sectionId].children[0];

    const res = canDrop(doc, { kind: "node", nodeId: columnsId }, { parentId: doc.rootId, index: 0 });
    expect(res).toEqual({ ok: false, reason: "Cannot move this node because it is required by its parent structure." });
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

  test("rejects moving a Column between different Columns layouts", () => {
    const doc = createDefaultDocument();
    const idFactory = createDeterministicIdFactory({ startAt: { section: 2, columns: 2, column: 3 } });

    const pageId = doc.rootId;
    const section2 = createNode("section", { idFactory, parentId: pageId });
    const columns2 = createNode("columns", { idFactory, parentId: section2.id });
    const col3 = createNode("column", { idFactory, parentId: columns2.id });
    const col4 = createNode("column", { idFactory, parentId: columns2.id });

    doc.nodes[section2.id] = section2;
    doc.nodes[columns2.id] = columns2;
    doc.nodes[col3.id] = col3;
    doc.nodes[col4.id] = col4;

    doc.nodes[pageId].children.push(section2.id);
    doc.nodes[section2.id].children = [columns2.id];
    doc.nodes[columns2.id].children = [col3.id, col4.id];

    const sourceCol = doc.nodes.columns_1.children[0];
    const res = canDrop(doc, { kind: "node", nodeId: sourceCol }, { parentId: columns2.id, index: 0 });
    expect(res).toEqual({ ok: false, reason: "Columns cannot be moved between layouts. Change the columns count instead." });
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
