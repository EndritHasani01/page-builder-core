import { describe, expect, test } from "vitest";

import { createDefaultDocument } from "@/editor-core";

import { computeDropIntent } from "./computeIntent";

describe("computeDropIntent", () => {
  test("returns the closest-target reason for invalid drops", () => {
    const doc = createDefaultDocument();
    const sectionId = doc.nodes[doc.rootId].children[0];
    const columnsId = doc.nodes[sectionId].children[0];

    const res = computeDropIntent({
      doc,
      breakpoint: "lg",
      source: { kind: "palette", nodeType: "text" },
      overContainerId: columnsId,
      pointer: { x: 10, y: 10 },
    });

    expect(res).toEqual({ ok: false, overId: columnsId, reason: "Cannot insert into Columns directly." });
  });
});

