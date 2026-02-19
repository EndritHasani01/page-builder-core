import { describe, expect, test } from "vitest";

import { blockRegistry } from "@/editor-core";

describe("blockRegistry", () => {
  test("Columns inspector uses a numeric Columns field with bounds", () => {
    const inspector = blockRegistry.columns.inspector;
    expect(inspector).toBeDefined();

    const columnsField = inspector?.groups.flatMap((g) => g.fields).find((f) => f.path === "props.columns");
    if (!columnsField) throw new Error('Expected Columns inspector to include a field for "props.columns".');
    if (columnsField.kind !== "number") throw new Error('Expected "props.columns" field to be kind "number".');

    expect(columnsField).toMatchObject({
      kind: "number",
      path: "props.columns",
      label: "Columns",
      min: 2,
      max: 6,
      step: 1,
      required: true,
    });
  });
});

