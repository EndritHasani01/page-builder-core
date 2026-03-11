import { nanoid } from "nanoid";
import { z } from "zod";

import type { Subtree } from "@/editor-core";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const SubtreeNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  parentId: z.string().nullable(),
  children: z.array(z.string()),
  props: z.record(z.string(), z.unknown()),
  style: z.unknown().optional(),
  constraints: z.unknown().optional(),
});

const SubtreeSchema = z.object({
  rootId: z.string(),
  nodes: z.record(z.string(), SubtreeNodeSchema),
});

const SavedComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  createdAt: z.string(),
  subtree: SubtreeSchema,
});

const ComponentLibrarySchema = z.array(SavedComponentSchema);

// ─── Types ────────────────────────────────────────────────────────────────────

export type SavedComponent = {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  subtree: Subtree;
};

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "pb:components:v1";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function safeGet(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeSet(value: string): { ok: true } | { ok: false; quota: boolean } {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? "";
    return { ok: false, quota: name === "QuotaExceededError" };
  }
}

function writeComponents(components: SavedComponent[]): { ok: true } | { ok: false; quota: boolean } {
  return safeSet(JSON.stringify(components));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadComponents(): SavedComponent[] {
  try {
    const raw = safeGet();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const result = ComponentLibrarySchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data as SavedComponent[];
  } catch {
    return [];
  }
}

export function saveComponent(
  input: { name: string; category: string; subtree: Subtree },
): { ok: true; id: string } | { ok: false; quota: boolean } {
  const components = loadComponents();
  const entry: SavedComponent = {
    id: nanoid(),
    name: input.name,
    category: input.category,
    createdAt: new Date().toISOString(),
    subtree: input.subtree,
  };
  components.push(entry);
  const res = writeComponents(components);
  if (!res.ok) return res;
  return { ok: true, id: entry.id };
}

export function deleteComponent(id: string): void {
  const components = loadComponents().filter((c) => c.id !== id);
  writeComponents(components);
}

export function renameComponent(id: string, name: string): void {
  const components = loadComponents().map((c) => (c.id === id ? { ...c, name } : c));
  writeComponents(components);
}

export function exportComponentAsJson(id: string): string | null {
  const component = loadComponents().find((c) => c.id === id);
  if (!component) return null;
  return JSON.stringify(component, null, 2);
}

export function getExistingCategories(): string[] {
  const components = loadComponents();
  return [...new Set(components.map((c) => c.category).filter(Boolean))];
}
