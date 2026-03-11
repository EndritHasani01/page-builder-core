import type { InlineSegment, RichContent } from "./types";

export function richContentToPlainText(content: RichContent): string {
  return content.map((seg) => seg.text).join("");
}

export function plainTextToRichContent(text: string): RichContent {
  return [{ text }];
}

export function mergeAdjacentSegments(segments: RichContent): RichContent {
  if (segments.length === 0) return [{ text: "" }];
  const result: RichContent = [];
  for (const seg of segments) {
    const prev = result[result.length - 1];
    if (prev && canMergeSegments(prev, seg)) {
      result[result.length - 1] = { ...prev, text: prev.text + seg.text };
    } else {
      result.push(seg);
    }
  }
  return result;
}

function canMergeSegments(a: InlineSegment, b: InlineSegment): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.code === b.code &&
    linksEqual(a.link, b.link)
  );
}

function linksEqual(
  a: InlineSegment["link"],
  b: InlineSegment["link"],
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.href === b.href;
}

type ActiveMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: { href: string };
};

function walkDomNode(
  node: globalThis.Node,
  out: RichContent,
  marks: ActiveMarks,
): void {
  if (node.nodeType === globalThis.Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) {
      const seg: InlineSegment = { text };
      if (marks.bold) seg.bold = true;
      if (marks.italic) seg.italic = true;
      if (marks.underline) seg.underline = true;
      if (marks.strikethrough) seg.strikethrough = true;
      if (marks.code) seg.code = true;
      if (marks.link) seg.link = { href: marks.link.href };
      out.push(seg);
    }
    return;
  }

  if (node.nodeType !== globalThis.Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const childMarks: ActiveMarks = { ...marks };

  if (tag === "strong" || tag === "b") childMarks.bold = true;
  if (tag === "em" || tag === "i") childMarks.italic = true;
  if (tag === "u") childMarks.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") childMarks.strikethrough = true;
  if (tag === "code") childMarks.code = true;
  if (tag === "a") {
    const href = el.getAttribute("href");
    if (href) childMarks.link = { href };
  }

  for (const child of Array.from(el.childNodes)) {
    walkDomNode(child, out, childMarks);
  }
}

/**
 * Converts the DOM content of a contentEditable element into a RichContent
 * array. Traverses the node tree to extract text with inline marks.
 */
export function domToRichContent(el: HTMLElement): RichContent {
  const segments: RichContent = [];
  walkDomNode(el, segments, {});
  const merged = mergeAdjacentSegments(segments);
  return merged.length > 0 ? merged : [{ text: "" }];
}

/**
 * Creates a DOM node for a single InlineSegment. Nests wrapper elements
 * for active marks. Wraps outermost to innermost: bold > italic > underline >
 * strikethrough > code > link > text. Does NOT set href for unsafe URLs —
 * the caller is responsible for href validation in security-sensitive contexts.
 */
export function buildSegmentDomNode(seg: InlineSegment): globalThis.Node {
  let node: globalThis.Node = document.createTextNode(seg.text);

  if (seg.code) {
    const code = document.createElement("code");
    code.appendChild(node);
    node = code;
  }

  if (seg.link?.href) {
    const a = document.createElement("a");
    a.setAttribute("href", seg.link.href);
    a.appendChild(node);
    node = a;
  }

  if (seg.strikethrough) {
    const s = document.createElement("s");
    s.appendChild(node);
    node = s;
  }

  if (seg.underline) {
    const u = document.createElement("u");
    u.appendChild(node);
    node = u;
  }

  if (seg.italic) {
    const em = document.createElement("em");
    em.appendChild(node);
    node = em;
  }

  if (seg.bold) {
    const strong = document.createElement("strong");
    strong.appendChild(node);
    node = strong;
  }

  return node;
}
