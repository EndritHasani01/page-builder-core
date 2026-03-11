import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { editorStore } from "@/store";
import type { ActionContext, EditorAction } from "../actions";
import { EDITOR_ACTIONS } from "../actions";

import styles from "./CommandPalette.module.css";

const RECENT_KEY = "pb:recentActions";
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    // ignore quota errors
  }
}

/** Simple fuzzy scorer: returns a score >= 0 if all query chars appear in order, else -1. */
export function fuzzyScore(label: string, query: string): number {
  if (!query) return 0;
  const lLabel = label.toLowerCase();
  const lQuery = query.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -1;
  for (let li = 0; li < lLabel.length && qi < lQuery.length; li++) {
    if (lLabel[li] === lQuery[qi]) {
      // Bonus for consecutiveness and word boundaries
      const consecutive = prev === li - 1;
      const wordBoundary = li === 0 || lLabel[li - 1] === " " || lLabel[li - 1] === "-";
      score += consecutive ? 3 : wordBoundary ? 2 : 1;
      prev = li;
      qi++;
    }
  }
  if (qi < lQuery.length) return -1; // not all chars matched
  return score;
}

type Props = {
  onClose: () => void;
  actionContext: ActionContext;
};

export function CommandPalette({ onClose, actionContext }: Props) {
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecent());
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const state = editorStore.getState();

  const availableActions = useMemo(
    () => EDITOR_ACTIONS.filter((a) => !a.when || a.when(state)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Actions to display in the list */
  const displayItems = useMemo((): Array<{ action: EditorAction; score: number }> => {
    const q = query.trim();
    if (!q) {
      // Show recent first, then all actions by category
      const recentActions = recentIds
        .map((id) => availableActions.find((a) => a.id === id))
        .filter(Boolean) as EditorAction[];
      const restIds = new Set(recentIds);
      const rest = availableActions.filter((a) => !restIds.has(a.id));
      return [
        ...recentActions.map((a) => ({ action: a, score: 0 })),
        ...rest.map((a) => ({ action: a, score: 0 })),
      ];
    }
    return availableActions
      .map((a) => ({ action: a, score: fuzzyScore(a.label, q) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [query, availableActions, recentIds]);

  // Reset highlight when list changes
  useEffect(() => {
    setHighlighted(0);
  }, [displayItems.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const execute = (action: EditorAction) => {
    // Update recent
    const next = [action.id, ...recentIds.filter((id) => id !== action.id)].slice(0, MAX_RECENT);
    setRecentIds(next);
    saveRecent(next);
    onClose();
    action.execute(editorStore, actionContext);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = displayItems[highlighted];
      if (item) execute(item.action);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Group display items for empty-query view
  const sections = useMemo(() => {
    if (query.trim()) return null;
    const recentSet = new Set(recentIds);
    const groups: Array<{ heading: string; items: typeof displayItems }> = [];
    const recentItems = displayItems.filter((x) => recentSet.has(x.action.id));
    if (recentItems.length > 0) groups.push({ heading: "Recent", items: recentItems });
    const byCategory = new Map<string, typeof displayItems>();
    for (const item of displayItems) {
      if (recentSet.has(item.action.id)) continue;
      const cat = item.action.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    }
    for (const [cat, items] of byCategory) {
      groups.push({ heading: cat, items });
    }
    return groups;
  }, [query, displayItems, recentIds]);

  const overlay = (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.palette} role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className={styles.searchRow}>
          <svg className={styles.searchIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.escHint}>Esc</kbd>
        </div>

        <ul ref={listRef} className={styles.list} role="listbox">
          {displayItems.length === 0 ? (
            <li className={styles.empty}>No commands found</li>
          ) : sections ? (
            // Grouped view (no query)
            (() => {
              let globalIndex = 0;
              return sections.map((section) => (
                <li key={section.heading}>
                  <div className={styles.groupHeading}>{section.heading}</div>
                  <ul className={styles.groupList} role="group">
                    {section.items.map((item) => {
                      const idx = globalIndex++;
                      return (
                        <ActionItem
                          key={item.action.id}
                          action={item.action}
                          highlighted={idx === highlighted}
                          onMouseEnter={() => setHighlighted(idx)}
                          onClick={() => execute(item.action)}
                        />
                      );
                    })}
                  </ul>
                </li>
              ));
            })()
          ) : (
            // Flat filtered view
            displayItems.map((item, idx) => (
              <ActionItem
                key={item.action.id}
                action={item.action}
                highlighted={idx === highlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => execute(item.action)}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function ActionItem({
  action,
  highlighted,
  onMouseEnter,
  onClick,
}: {
  action: EditorAction;
  highlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <li
      className={[styles.item, highlighted ? styles.itemHighlighted : ""].filter(Boolean).join(" ")}
      role="option"
      aria-selected={highlighted}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className={styles.itemLabel}>{action.label}</span>
      <span className={styles.itemMeta}>
        <span className={styles.categoryBadge}>{action.category}</span>
        {action.shortcut ? <kbd className={styles.shortcutBadge}>{action.shortcut}</kbd> : null}
      </span>
    </li>
  );
}
