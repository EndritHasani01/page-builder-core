import { describe, expect, test } from "vitest";

import { createDefaultDocument, createDeterministicIdFactory, createNode } from "@/editor-core";

import { exportDocumentToHtml, exportDocumentToJson } from "./index";

describe("export", () => {
  test("exportDocumentToJson returns pretty-printed canonical JSON", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const { json } = exportDocumentToJson(doc);

    expect(json).toContain(`"schemaVersion": "1.0.0"`);
    expect(json).toContain(`\n  "meta": {`);
    expect(json.endsWith("\n")).toBe(false);
  });

  test("exportDocumentToHtml returns no warnings for a safe document", async () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const res = await exportDocumentToHtml(doc, { breakpoint: "lg", mode: "snippet" });

    expect(res.warnings).toEqual([]);
    expect(res.html).toContain("<div");
    expect(res.html).toContain('lang="en"');
    expect(res.html).not.toContain("data-node-id");
  });

  test("exportDocumentToHtml removes unsafe URLs and omits editor markers", async () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    const idFactory = createDeterministicIdFactory({ startAt: { button: 10, image: 10, text: 10 } });

    const safeButton = createNode("button", {
      idFactory,
      parentId: "column_1",
      props: { label: "Safe", href: "https://example.com" },
    });

    const unsafeButton = createNode("button", {
      idFactory,
      parentId: "column_1",
      props: { label: "Unsafe", href: "javascript:alert(1)" },
    });

    const unsafeImage = createNode("image", {
      idFactory,
      parentId: "column_1",
      props: {
        src: "javascript:alert(1)",
        alt: "Image",
        fit: "cover",
        linkTo: "vbscript:msgbox(1)",
      },
    });

    const hiddenText = createNode("text", {
      idFactory,
      parentId: "column_1",
      props: { text: "Secret" },
      constraints: { hidden: true },
    });

    doc.nodes[safeButton.id] = safeButton;
    doc.nodes[unsafeButton.id] = unsafeButton;
    doc.nodes[unsafeImage.id] = unsafeImage;
    doc.nodes[hiddenText.id] = hiddenText;
    doc.nodes["column_1"].children = [safeButton.id, unsafeButton.id, unsafeImage.id, hiddenText.id];

    const res = await exportDocumentToHtml(doc, { breakpoint: "lg", mode: "snippet" });

    expect(res.html).toContain('href="https://example.com"');
    expect(res.html.toLowerCase()).not.toContain("javascript:");
    expect(res.html.toLowerCase()).not.toContain("vbscript:");
    expect(res.html).not.toContain("Secret");
    expect(res.html).not.toContain("data-node-id");
    expect(res.html).not.toContain("data-dnd-");

    const warningText = res.warnings.join("\n");
    expect(warningText).toContain("hidden node(s)");
    expect(warningText).toContain("Unsafe URLs");
    expect(warningText).toContain("button.href");
    expect(warningText).toContain("image.src");
    expect(warningText).toContain("image.linkTo");
  });
});
