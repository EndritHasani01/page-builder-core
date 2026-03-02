import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./FloatingToolbar.module.css";

function getSelectionInElement(el: HTMLElement): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;
  return sel;
}

function isWrappedInTag(range: Range, tag: string): boolean {
  let node: Node | null = range.commonAncestorContainer;
  while (node) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName.toLowerCase() === tag
    ) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

/**
 * A floating formatting toolbar that appears when text is selected within a
 * contentEditable element. Uses document.execCommand for bold/italic/underline/
 * strikethrough (still widely supported), and manual DOM wrapping for code.
 * Links use execCommand('createLink') / execCommand('unlink').
 *
 * Renders via createPortal at document.body to avoid z-index and overflow
 * clipping issues. Toolbar buttons use onMouseDown + preventDefault to avoid
 * stealing focus from the contentEditable element.
 */
export function FloatingToolbar(props: {
  editingRef: RefObject<HTMLElement | null>;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [marks, setMarks] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    link: false,
  });
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const savedRangeRef = useRef<Range | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const el = props.editingRef.current;
      if (!el) {
        setRect(null);
        return;
      }

      const sel = getSelectionInElement(el);
      if (!sel) {
        setRect(null);
        return;
      }

      const range = sel.getRangeAt(0);
      setRect(range.getBoundingClientRect());
      setMarks({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
        code: isWrappedInTag(range, "code"),
        link: isWrappedInTag(range, "a"),
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [props.editingRef]);

  if (!rect) return null;

  const toolbarWidth = 280;
  const left = Math.max(8, rect.left + rect.width / 2 - toolbarWidth / 2);
  const top = rect.top - 44;

  const applyMark = (command: string) => {
    document.execCommand(command, false);
    props.editingRef.current?.focus();
  };

  const applyCode = (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (isWrappedInTag(range, "code")) {
      document.execCommand("removeFormat", false);
    } else {
      const code = document.createElement("code");
      try {
        range.surroundContents(code);
      } catch {
        // Selection spans multiple elements; fall back to wrapping the fragment
        const frag = range.extractContents();
        code.appendChild(frag);
        range.insertNode(code);
      }
    }
    props.editingRef.current?.focus();
  };

  const startLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    setShowLinkInput(true);
    setLinkHref("");
    setTimeout(() => linkInputRef.current?.focus(), 0);
  };

  const commitLink = (e?: React.MouseEvent) => {
    e?.preventDefault();
    const href = linkHref.trim();
    if (href) {
      const sel = window.getSelection();
      if (savedRangeRef.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
      document.execCommand("createLink", false, href);
    }
    setShowLinkInput(false);
    setLinkHref("");
    savedRangeRef.current = null;
    props.editingRef.current?.focus();
  };

  const removeLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    document.execCommand("unlink", false);
    setShowLinkInput(false);
    savedRangeRef.current = null;
    props.editingRef.current?.focus();
  };

  const cancelLink = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowLinkInput(false);
    setLinkHref("");
    savedRangeRef.current = null;
  };

  const toolbar = (
    <div
      className={styles.toolbar}
      style={{ top, left, width: toolbarWidth }}
      data-floating-toolbar="true"
    >
      {showLinkInput ? (
        <div className={styles.linkRow}>
          <input
            ref={linkInputRef}
            type="url"
            className={styles.linkInput}
            value={linkHref}
            placeholder="https://..."
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setShowLinkInput(false);
              }
            }}
          />
          <button
            type="button"
            className={styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={commitLink}
          >
            Apply
          </button>
          {marks.link && (
            <button
              type="button"
              className={styles.btn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeLink}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelLink}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className={styles.btnGroup}>
          <button
            type="button"
            className={marks.bold ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMark("bold")}
            title="Bold"
            aria-label="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={marks.italic ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMark("italic")}
            title="Italic"
            aria-label="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={marks.underline ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMark("underline")}
            title="Underline"
            aria-label="Underline"
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className={marks.strikethrough ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyMark("strikeThrough")}
            title="Strikethrough"
            aria-label="Strikethrough"
          >
            <s>S</s>
          </button>
          <button
            type="button"
            className={marks.code ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyCode}
            title="Code"
            aria-label="Code"
          >
            {"</>"}
          </button>
          <div className={styles.separator} />
          <button
            type="button"
            className={marks.link ? `${styles.btn} ${styles.active}` : styles.btn}
            onMouseDown={startLink}
            title="Link"
            aria-label="Link"
          >
            Link
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(toolbar, document.body);
}
