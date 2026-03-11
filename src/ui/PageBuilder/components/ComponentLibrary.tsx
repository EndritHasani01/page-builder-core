import { useCallback, useEffect, useRef, useState } from "react";

import { useDraggable } from "@dnd-kit/core";

import { blockRegistry } from "@/editor-core";
import type { DragPayload } from "@/dnd";
import { componentDragId } from "@/dnd";
import {
  deleteComponent,
  exportComponentAsJson,
  loadComponents,
  renameComponent,
  type SavedComponent,
} from "@/persistence/componentLibrary";
import { downloadText } from "../pageBuilderUtils";

import { EmptyLibrary } from "./EmptyLibrary";
import styles from "./ComponentLibrary.module.css";

interface Props {
  /** Called whenever a component is deleted/renamed so the parent can re-render. */
  onChanged: () => void;
  disabled: boolean;
}

export function ComponentLibrary({ onChanged, disabled }: Props) {
  const [components, setComponents] = useState<SavedComponent[]>(() => loadComponents());

  const refresh = useCallback(() => {
    setComponents(loadComponents());
    onChanged();
  }, [onChanged]);

  if (components.length === 0) {
    return <EmptyLibrary />;
  }

  // Group by category
  const grouped = groupByCategory(components);
  const showHeaders = grouped.length > 1 || (grouped.length === 1 && grouped[0].category !== "Uncategorized");

  return (
    <div className={styles.root} data-testid="component-library">
      {grouped.map(({ category, items }) => (
        <CategorySection
          key={category}
          category={category}
          items={items}
          showHeader={showHeaders}
          disabled={disabled}
          onRefresh={refresh}
        />
      ))}
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  items,
  showHeader,
  disabled,
  onRefresh,
}: {
  category: string;
  items: SavedComponent[];
  showHeader: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.categorySection}>
      {showHeader && (
        <button
          type="button"
          className={styles.categoryHeader}
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className={styles.categoryLabel}>{category}</span>
          <span className={styles.categoryChevron} data-collapsed={collapsed ? "true" : "false"}>
            ▼
          </span>
        </button>
      )}
      {!collapsed && (
        <ul className={styles.categoryItems} role="list">
          {items.map((comp) => (
            <ComponentItem key={comp.id} component={comp} disabled={disabled} onRefresh={onRefresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Component item ───────────────────────────────────────────────────────────

function ComponentItem({
  component,
  disabled,
  onRefresh,
}: {
  component: SavedComponent;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(component.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const rootType = component.subtree.nodes[component.subtree.rootId]?.type ?? "section";
  const blockLabel = (blockRegistry as Record<string, { label: string } | undefined>)[rootType]?.label ?? rootType;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: componentDragId(component.id),
    disabled,
    data: { kind: "component", componentId: component.id } satisfies DragPayload,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== component.name) {
      renameComponent(component.id, trimmed);
      onRefresh();
    }
    setRenaming(false);
  };

  const handleRenameKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      setRenameValue(component.name);
      setRenaming(false);
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    deleteComponent(component.id);
    onRefresh();
  };

  const handleExport = () => {
    setMenuOpen(false);
    const json = exportComponentAsJson(component.id);
    if (json) downloadText(`${component.name}.json`, json, "application/json");
  };

  return (
    <li
      ref={setNodeRef}
      className={styles.item}
      data-dragging={isDragging ? "true" : "false"}
      data-testid={`component-item-${component.id}`}
      {...attributes}
      {...listeners}
    >
      <span className={styles.itemIcon}>☰</span>

      {renaming ? (
        <input
          ref={renameRef}
          className={styles.renameInput}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKey}
          onClick={(e) => e.stopPropagation()}
          data-testid="rename-component-input"
        />
      ) : (
        <span className={styles.itemName} title={component.name}>
          {component.name}
        </span>
      )}

      <span className={styles.itemType}>{blockLabel}</span>

      <div className={styles.dropdownWrapper} ref={menuRef}>
        <button
          type="button"
          className={styles.menuTrigger}
          aria-label={`Options for ${component.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`component-menu-${component.id}`}
        >
          •••
        </button>
        {menuOpen && (
          <div className={styles.dropdown} role="menu">
            <button
              type="button"
              className={styles.dropdownItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setRenaming(true);
                setRenameValue(component.name);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className={styles.dropdownItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                handleExport();
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              data-testid={`delete-component-${component.id}`}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByCategory(components: SavedComponent[]): { category: string; items: SavedComponent[] }[] {
  const map = new Map<string, SavedComponent[]>();
  for (const comp of components) {
    const cat = comp.category || "Uncategorized";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(comp);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
