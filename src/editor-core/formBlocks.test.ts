import { describe, expect, test } from "vitest";

import { blockRegistry } from "@/editor-core";
import { createDeterministicIdFactory, createNode } from "@/editor-core";
import { isProbablySafeUrl } from "@/editor-core";

// ─── form ─────────────────────────────────────────────────────────────────────

describe("form block", () => {
  test("validates unsafe action URL", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("form", {
      idFactory,
      parentId: "root",
      props: { action: "javascript:alert(1)", method: "post" },
    });
    const issues = blockRegistry.form.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.action");
  });

  test("passes with empty action (no URL required)", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("form", {
      idFactory,
      parentId: "root",
      props: { action: "", method: "post" },
    });
    const issues = blockRegistry.form.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("passes with a safe https action URL", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("form", {
      idFactory,
      parentId: "root",
      props: { action: "https://formspree.io/f/abc123", method: "post" },
    });
    const issues = blockRegistry.form.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });

  test("inspector has action, method, and name fields", () => {
    const inspector = blockRegistry.form.inspector;
    expect(inspector).toBeDefined();
    const fields = inspector!.groups.flatMap((g) => g.fields);
    expect(fields.some((f) => f.path === "props.action")).toBe(true);
    expect(fields.some((f) => f.path === "props.method" && f.kind === "select")).toBe(true);
    expect(fields.some((f) => f.path === "props.name")).toBe(true);
  });
});

// ─── textInput ────────────────────────────────────────────────────────────────

describe("textInput block", () => {
  test("validates missing name", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("textInput", {
      idFactory,
      parentId: "form1",
      props: { label: "Email", name: "", placeholder: "", inputType: "email", required: true },
    });
    const issues = blockRegistry.textInput.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.name");
  });

  test("passes when name is set", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("textInput", {
      idFactory,
      parentId: "form1",
      props: { label: "Email", name: "email", placeholder: "", inputType: "email", required: false },
    });
    const issues = blockRegistry.textInput.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── textarea ─────────────────────────────────────────────────────────────────

describe("textarea block", () => {
  test("validates missing name", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("textarea", {
      idFactory,
      parentId: "form1",
      props: { label: "Message", name: "", placeholder: "", rows: 4, required: false },
    });
    const issues = blockRegistry.textarea.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.name");
  });

  test("passes when name is set", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("textarea", {
      idFactory,
      parentId: "form1",
      props: { label: "Message", name: "message", placeholder: "", rows: 4, required: false },
    });
    const issues = blockRegistry.textarea.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── selectInput ──────────────────────────────────────────────────────────────

describe("selectInput block", () => {
  test("validates empty options list", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("selectInput", {
      idFactory,
      parentId: "form1",
      props: { label: "Choose", name: "choice", options: [], required: false },
    });
    const issues = blockRegistry.selectInput.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.options");
  });

  test("passes when options list is non-empty", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("selectInput", {
      idFactory,
      parentId: "form1",
      props: { label: "Choose", name: "choice", options: [{ label: "A", value: "a" }], required: false },
    });
    const issues = blockRegistry.selectInput.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── radioGroup ───────────────────────────────────────────────────────────────

describe("radioGroup block", () => {
  test("validates empty options list", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("radioGroup", {
      idFactory,
      parentId: "form1",
      props: { label: "Pick one", name: "pick", options: [], required: true },
    });
    const issues = blockRegistry.radioGroup.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].fieldPath).toBe("props.options");
  });

  test("passes when options list is non-empty", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("radioGroup", {
      idFactory,
      parentId: "form1",
      props: { label: "Pick one", name: "pick", options: [{ label: "Yes", value: "yes" }], required: false },
    });
    const issues = blockRegistry.radioGroup.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── submitButton ─────────────────────────────────────────────────────────────

describe("submitButton block", () => {
  test("warns on empty label", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("submitButton", {
      idFactory,
      parentId: "form1",
      props: { label: "   ", variant: "primary" },
    });
    const issues = blockRegistry.submitButton.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("warning");
    expect(issues[0].fieldPath).toBe("props.label");
  });

  test("passes with a non-empty label", () => {
    const idFactory = createDeterministicIdFactory();
    const node = createNode("submitButton", {
      idFactory,
      parentId: "form1",
      props: { label: "Submit", variant: "primary" },
    });
    const issues = blockRegistry.submitButton.validate!(node as never, { doc: {} as never });
    expect(issues).toHaveLength(0);
  });
});

// ─── URL safety helper ────────────────────────────────────────────────────────

describe("isProbablySafeUrl (form action context)", () => {
  test("rejects javascript: URLs", () => {
    expect(isProbablySafeUrl("javascript:alert(1)")).toBe(false);
  });

  test("rejects data: URLs", () => {
    expect(isProbablySafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  test("accepts https: URLs", () => {
    expect(isProbablySafeUrl("https://formspree.io/f/abc123")).toBe(true);
  });

  test("accepts relative paths", () => {
    expect(isProbablySafeUrl("/api/submit")).toBe(true);
  });
});

// ─── allowedChildren ──────────────────────────────────────────────────────────

describe("form block allowedChildren", () => {
  const formInputTypes = ["textInput", "textarea", "selectInput", "checkbox", "radioGroup", "submitButton"] as const;

  test("form allows all form input types", () => {
    for (const type of formInputTypes) {
      expect(blockRegistry.form.allowedChildren).toContain(type);
    }
  });

  test("column allows form inputs directly", () => {
    for (const type of formInputTypes) {
      expect(blockRegistry.column.allowedChildren).toContain(type);
    }
  });

  test("column allows form", () => {
    expect(blockRegistry.column.allowedChildren).toContain("form");
  });

  test("container allows form inputs directly", () => {
    for (const type of formInputTypes) {
      expect(blockRegistry.container.allowedChildren).toContain(type);
    }
  });

  test("container allows form", () => {
    expect(blockRegistry.container.allowedChildren).toContain("form");
  });
});
