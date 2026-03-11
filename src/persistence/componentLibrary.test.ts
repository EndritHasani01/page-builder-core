import { describe, expect, test, beforeEach } from "vitest";

import {
  deleteComponent,
  exportComponentAsJson,
  getExistingCategories,
  loadComponents,
  renameComponent,
  saveComponent,
} from "./componentLibrary";

const STORAGE_KEY = "pb:components:v1";

function makeSubtree() {
  return {
    rootId: "node-1",
    nodes: {
      "node-1": {
        id: "node-1",
        type: "section" as const,
        parentId: null,
        children: [],
        props: { variant: "default" },
      },
    },
  };
}

describe("componentLibrary", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // ─── loadComponents ─────────────────────────────────────────────────────────

  test("loadComponents returns [] when localStorage is empty", () => {
    expect(loadComponents()).toEqual([]);
  });

  test("loadComponents returns [] on corrupt JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadComponents()).toEqual([]);
  });

  test("loadComponents returns [] when data fails schema validation", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ bad: "data" }]));
    expect(loadComponents()).toEqual([]);
  });

  test("loadComponents returns [] when stored value is not an array", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "x" }));
    expect(loadComponents()).toEqual([]);
  });

  // ─── saveComponent ───────────────────────────────────────────────────────────

  test("saveComponent persists a component and loadComponents retrieves it", () => {
    const subtree = makeSubtree();
    const res = saveComponent({ name: "Hero Section", category: "Headers", subtree });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const components = loadComponents();
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("Hero Section");
    expect(components[0].category).toBe("Headers");
    expect(components[0].id).toBe(res.id);
    expect(components[0].subtree.rootId).toBe("node-1");
    expect(components[0].createdAt).toBeDefined();
  });

  test("saveComponent appends to existing components", () => {
    const subtree = makeSubtree();
    saveComponent({ name: "A", category: "Cat1", subtree });
    saveComponent({ name: "B", category: "Cat2", subtree });

    const components = loadComponents();
    expect(components).toHaveLength(2);
    expect(components[0].name).toBe("A");
    expect(components[1].name).toBe("B");
  });

  test("each saved component gets a unique id", () => {
    const subtree = makeSubtree();
    const r1 = saveComponent({ name: "A", category: "Cat", subtree });
    const r2 = saveComponent({ name: "B", category: "Cat", subtree });

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.id).not.toBe(r2.id);
  });

  // ─── deleteComponent ─────────────────────────────────────────────────────────

  test("deleteComponent removes the component by id", () => {
    const subtree = makeSubtree();
    const res = saveComponent({ name: "To delete", category: "Cat", subtree });
    if (!res.ok) throw new Error("save failed");

    saveComponent({ name: "Keeper", category: "Cat", subtree });

    deleteComponent(res.id);

    const components = loadComponents();
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe("Keeper");
  });

  test("deleteComponent is a no-op for unknown id", () => {
    const subtree = makeSubtree();
    saveComponent({ name: "Keep", category: "Cat", subtree });

    deleteComponent("nonexistent-id");

    expect(loadComponents()).toHaveLength(1);
  });

  // ─── renameComponent ─────────────────────────────────────────────────────────

  test("renameComponent updates the name", () => {
    const subtree = makeSubtree();
    const res = saveComponent({ name: "Old Name", category: "Cat", subtree });
    if (!res.ok) throw new Error("save failed");

    renameComponent(res.id, "New Name");

    const components = loadComponents();
    expect(components[0].name).toBe("New Name");
  });

  test("renameComponent leaves other components untouched", () => {
    const subtree = makeSubtree();
    const r1 = saveComponent({ name: "One", category: "Cat", subtree });
    const r2 = saveComponent({ name: "Two", category: "Cat", subtree });
    if (!r1.ok || !r2.ok) throw new Error("save failed");

    renameComponent(r1.id, "One Renamed");

    const components = loadComponents();
    expect(components.find((c) => c.id === r1.id)?.name).toBe("One Renamed");
    expect(components.find((c) => c.id === r2.id)?.name).toBe("Two");
  });

  // ─── exportComponentAsJson ───────────────────────────────────────────────────

  test("exportComponentAsJson returns formatted JSON for a known id", () => {
    const subtree = makeSubtree();
    const res = saveComponent({ name: "Export Me", category: "Cat", subtree });
    if (!res.ok) throw new Error("save failed");

    const json = exportComponentAsJson(res.id);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!) as { name: string; subtree: { rootId: string } };
    expect(parsed.name).toBe("Export Me");
    expect(parsed.subtree.rootId).toBe("node-1");
  });

  test("exportComponentAsJson returns null for unknown id", () => {
    expect(exportComponentAsJson("no-such-id")).toBeNull();
  });

  // ─── getExistingCategories ───────────────────────────────────────────────────

  test("getExistingCategories returns unique categories", () => {
    const subtree = makeSubtree();
    saveComponent({ name: "A", category: "Headers", subtree });
    saveComponent({ name: "B", category: "Footers", subtree });
    saveComponent({ name: "C", category: "Headers", subtree });

    const cats = getExistingCategories();
    expect(cats).toContain("Headers");
    expect(cats).toContain("Footers");
    // No duplicates
    expect(cats.filter((c) => c === "Headers")).toHaveLength(1);
  });

  test("getExistingCategories returns [] when library is empty", () => {
    expect(getExistingCategories()).toEqual([]);
  });

  // ─── Subtree integrity ───────────────────────────────────────────────────────

  test("subtree is stored and retrieved intact", () => {
    const subtree = {
      rootId: "sec-1",
      nodes: {
        "sec-1": {
          id: "sec-1",
          type: "section" as const,
          parentId: null,
          children: ["col-1"],
          props: { variant: "hero" },
        },
        "col-1": {
          id: "col-1",
          type: "column" as const,
          parentId: "sec-1",
          children: [],
          props: {},
        },
      },
    };

    const res = saveComponent({ name: "Hero", category: "CTAs", subtree });
    if (!res.ok) throw new Error("save failed");

    const [comp] = loadComponents();
    expect(comp.subtree.rootId).toBe("sec-1");
    expect(Object.keys(comp.subtree.nodes)).toHaveLength(2);
    expect(comp.subtree.nodes["sec-1"].children).toEqual(["col-1"]);
    expect(comp.subtree.nodes["col-1"].parentId).toBe("sec-1");
  });
});
