import { beforeEach, describe, expect, test } from "vitest";

import { createDefaultDocument } from "@/editor-core";

import {
  createWorkspaceDocument,
  deleteWorkspaceDocument,
  ensureWorkspaceEntryForDocument,
  listWorkspaceDocuments,
  removeWorkspaceDocumentMeta,
  upsertWorkspaceDocumentMeta,
} from "./workspace";

describe("persistence/workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("listWorkspaceDocuments returns empty when index is missing", () => {
    expect(listWorkspaceDocuments()).toEqual([]);
  });

  test("listWorkspaceDocuments returns empty when index is corrupt", () => {
    window.localStorage.setItem("pb:index:v1", "{");
    expect(listWorkspaceDocuments()).toEqual([]);
  });

  test("upsertWorkspaceDocumentMeta inserts and sorts newest updated first", () => {
    upsertWorkspaceDocumentMeta({
      id: "a",
      title: "A",
      createdAt: "2026-02-18T12:00:00.000Z",
      updatedAt: "2026-02-18T12:10:00.000Z",
    });
    upsertWorkspaceDocumentMeta({
      id: "b",
      title: "B",
      createdAt: "2026-02-18T12:00:00.000Z",
      updatedAt: "2026-02-18T12:20:00.000Z",
    });

    const docs = listWorkspaceDocuments();
    expect(docs.map((d) => d.id)).toEqual(["b", "a"]);
  });

  test("createWorkspaceDocument persists a new doc and upserts index metadata", () => {
    const now = new Date("2026-02-18T12:00:00.000Z");
    const res = createWorkspaceDocument({ docId: "t", now, title: "My doc" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.docId).toBe("t");
    expect(window.localStorage.getItem("pb:doc:t")).toBeTruthy();

    const docs = listWorkspaceDocuments();
    expect(docs.some((d) => d.id === "t" && d.title === "My doc")).toBe(true);
  });

  test("deleteWorkspaceDocument removes snapshots and index entry", () => {
    const res = createWorkspaceDocument({ docId: "t", now: new Date("2026-02-18T12:00:00.000Z") });
    expect(res.ok).toBe(true);

    expect(deleteWorkspaceDocument("t").ok).toBe(true);
    expect(window.localStorage.getItem("pb:doc:t")).toBeNull();
    expect(window.localStorage.getItem("pb:doc:t:backup")).toBeNull();
    expect(listWorkspaceDocuments().some((d) => d.id === "t")).toBe(false);
  });

  test("ensureWorkspaceEntryForDocument inserts missing docs and updates titles without bumping timestamps", () => {
    const doc = createDefaultDocument(new Date("2026-02-18T12:00:00.000Z"));
    doc.meta.title = "One";

    expect(listWorkspaceDocuments().length).toBe(0);
    expect(ensureWorkspaceEntryForDocument("t", doc).ok).toBe(true);

    const initial = listWorkspaceDocuments().find((d) => d.id === "t");
    expect(initial?.title).toBe("One");

    upsertWorkspaceDocumentMeta({
      id: "t",
      title: "One",
      createdAt: "2026-02-18T12:00:00.000Z",
      updatedAt: "2026-02-18T12:30:00.000Z",
    });

    doc.meta.title = "Renamed";
    expect(ensureWorkspaceEntryForDocument("t", doc).ok).toBe(true);

    const after = listWorkspaceDocuments().find((d) => d.id === "t");
    expect(after?.title).toBe("Renamed");
    expect(after?.updatedAt).toBe("2026-02-18T12:30:00.000Z");
  });

  test("removeWorkspaceDocumentMeta deletes index entries without touching snapshots", () => {
    const res = createWorkspaceDocument({ docId: "t", now: new Date("2026-02-18T12:00:00.000Z") });
    expect(res.ok).toBe(true);

    expect(window.localStorage.getItem("pb:doc:t")).toBeTruthy();

    expect(removeWorkspaceDocumentMeta("t").ok).toBe(true);
    expect(listWorkspaceDocuments().some((d) => d.id === "t")).toBe(false);
    expect(window.localStorage.getItem("pb:doc:t")).toBeTruthy();
  });
});

