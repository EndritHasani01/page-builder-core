import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { DndContext } from "@dnd-kit/core";

import type { Document } from "@/editor-core";
import {
  deleteWorkspaceDocument,
  duplicateWorkspaceDocument,
  listWorkspaceDocuments,
  loadFromLocalStorage,
  saveWorkspaceDocument,
  upsertWorkspaceDocumentMeta,
} from "@/persistence";
import type { WorkspaceDocMeta } from "@/persistence";
import { RenderDocument } from "@/renderer";

import styles from "./WorkspaceDashboard.module.css";

// ─── Relative time ────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const ms = Date.now() - Date.parse(isoDate);
  if (!Number.isFinite(ms) || ms < 0) return "Edited recently";

  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Edited just now";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Edited ${mins} min${mins === 1 ? "" : "s"} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Edited ${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Edited ${days} day${days === 1 ? "" : "s"} ago`;

  const date = new Date(isoDate);
  return `Edited ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── Thumbnail error boundary ─────────────────────────────────────────────────

class ThumbnailErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { error: false };
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Lazy thumbnail ───────────────────────────────────────────────────────────

function DocumentThumbnail({ docId, title }: { docId: string; title: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Fallback for environments without IntersectionObserver (e.g., jsdom in tests)
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const result = loadFromLocalStorage(docId);
    if (result.ok) setDoc(result.doc);
  }, [visible, docId]);

  const fallback = (
    <div className={styles.thumbnailFallback}>
      <span className={styles.thumbnailFallbackText}>{title || "Untitled"}</span>
    </div>
  );

  return (
    <div ref={containerRef} className={styles.thumbnailOuter}>
      {doc ? (
        <ThumbnailErrorBoundary fallback={fallback}>
          <DndContext>
            <div className={styles.thumbnailInner} aria-hidden="true">
              <RenderDocument doc={doc} mode="export" breakpoint="lg" />
            </div>
          </DndContext>
        </ThumbnailErrorBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────

function DocumentCard(props: {
  doc: WorkspaceDocMeta;
  isEditingTitle: boolean;
  editingValue: string;
  menuOpen: boolean;
  onOpen: () => void;
  onTitleEditStart: () => void;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onRenameFromMenu: () => void;
}) {
  const { doc } = props;
  const title = doc.title?.trim() || "Untitled";
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.isEditingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [props.isEditingTitle]);

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      aria-label={`Open ${title}`}
      data-testid={`doc-card-${doc.id}`}
      onClick={props.onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      <DocumentThumbnail docId={doc.id} title={title} />

      <div className={styles.cardFooter}>
        <div
          className={styles.cardTitleArea}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {props.isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              className={styles.titleInput}
              value={props.editingValue}
              aria-label="Document title"
              onChange={(e) => props.onTitleChange(e.target.value)}
              onBlur={props.onTitleCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onTitleCommit();
                if (e.key === "Escape") props.onTitleCommit();
              }}
            />
          ) : (
            <span
              className={styles.cardTitle}
              title={title}
              onDoubleClick={props.onTitleEditStart}
            >
              {title}
            </span>
          )}
          <span className={styles.cardTimestamp}>{formatRelativeTime(doc.updatedAt)}</span>
        </div>

        <div
          className={styles.cardMenuWrapper}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <button
            type="button"
            className={styles.menuBtn}
            onClick={props.onMenuToggle}
            aria-label={`Actions for ${title}`}
            aria-haspopup="menu"
            aria-expanded={props.menuOpen}
          >
            •••
          </button>
          {props.menuOpen && (
            <div className={styles.menu} role="menu">
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={props.onOpen}
              >
                Open
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={props.onDuplicate}
              >
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={props.onRenameFromMenu}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={props.onExport}
              >
                Export JSON
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={props.onDelete}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortOption = "updated" | "created" | "alpha";

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function WorkspaceDashboard(props: {
  onOpenDocument: (docId: string) => void;
  onCreateDocument: () => void;
}) {
  const [docs, setDocs] = useState<WorkspaceDocMeta[]>(() => listWorkspaceDocuments());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("updated");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const refreshDocs = useCallback(() => {
    setDocs(listWorkspaceDocuments());
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest(`.${styles.cardMenuWrapper}`)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  const filteredDocs = docs
    .filter((d) => {
      if (!search.trim()) return true;
      return (d.title || d.id).toLowerCase().includes(search.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sort === "updated") return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (sort === "created") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return (a.title || a.id).localeCompare(b.title || b.id);
    });

  const handleDelete = useCallback(
    (doc: WorkspaceDocMeta) => {
      setMenuOpenId(null);
      const title = doc.title?.trim() || doc.id;
      const ok = window.confirm(
        `Are you sure you want to delete "${title}"? This cannot be undone.`,
      );
      if (!ok) return;
      deleteWorkspaceDocument(doc.id);
      refreshDocs();
    },
    [refreshDocs],
  );

  const handleDuplicate = useCallback(
    (doc: WorkspaceDocMeta) => {
      setMenuOpenId(null);
      const loaded = loadFromLocalStorage(doc.id);
      if (!loaded.ok) return;
      const result = duplicateWorkspaceDocument(loaded.doc);
      if (result.ok) refreshDocs();
    },
    [refreshDocs],
  );

  const handleRenameStart = useCallback((doc: WorkspaceDocMeta) => {
    setMenuOpenId(null);
    setEditingId(doc.id);
    setEditingValue(doc.title || "");
  }, []);

  const handleRenameCommit = useCallback(
    (docId: string) => {
      const value = editingValue.trim();
      setEditingId(null);
      if (!value) return;

      const loaded = loadFromLocalStorage(docId);
      if (loaded.ok) {
        loaded.doc.meta.title = value;
        saveWorkspaceDocument(docId, loaded.doc);
      } else {
        const existing = docs.find((d) => d.id === docId);
        if (existing) {
          void upsertWorkspaceDocumentMeta({ ...existing, title: value });
        }
      }
      refreshDocs();
    },
    [editingValue, docs, refreshDocs],
  );

  const handleExportJson = useCallback((doc: WorkspaceDocMeta) => {
    setMenuOpenId(null);
    const loaded = loadFromLocalStorage(doc.id);
    if (!loaded.ok) return;
    const json = JSON.stringify(loaded.doc, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title?.trim() || doc.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className={styles.dashboard} data-testid="workspace-dashboard">
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Page Builder</h1>
        <button type="button" className={styles.newPageBtn} onClick={props.onCreateDocument}>
          + New Page
        </button>
      </header>

      {/* Controls */}
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search pages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search documents"
          data-testid="dashboard-search"
        />
        <label className={styles.sortLabel}>
          <span className={styles.sortLabelText}>Sort:</span>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            aria-label="Sort documents"
          >
            <option value="updated">Last edited</option>
            <option value="created">Created date</option>
            <option value="alpha">Alphabetical (A–Z)</option>
          </select>
        </label>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {docs.length === 0 ? (
          <div className={styles.emptyState} data-testid="dashboard-empty">
            <div className={styles.emptyIcon} aria-hidden="true">
              📄
            </div>
            <h2 className={styles.emptyTitle}>Welcome to Page Builder</h2>
            <p className={styles.emptySubtitle}>Create your first page to get started</p>
            <button
              type="button"
              className={styles.emptyCreateBtn}
              onClick={props.onCreateDocument}
            >
              + Create Page
            </button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptySubtitle}>No pages match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <div className={styles.grid} role="list" aria-label="Documents">
            {filteredDocs.map((doc) => (
              <div key={doc.id} role="listitem">
                <DocumentCard
                  doc={doc}
                  isEditingTitle={editingId === doc.id}
                  editingValue={editingId === doc.id ? editingValue : ""}
                  menuOpen={menuOpenId === doc.id}
                  onOpen={() => {
                    setMenuOpenId(null);
                    props.onOpenDocument(doc.id);
                  }}
                  onTitleEditStart={() => handleRenameStart(doc)}
                  onTitleChange={setEditingValue}
                  onTitleCommit={() => handleRenameCommit(doc.id)}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuOpenId((prev) => (prev === doc.id ? null : doc.id));
                  }}
                  onDuplicate={() => handleDuplicate(doc)}
                  onDelete={() => handleDelete(doc)}
                  onExport={() => handleExportJson(doc)}
                  onRenameFromMenu={() => handleRenameStart(doc)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
