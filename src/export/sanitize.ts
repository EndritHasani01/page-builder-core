import { deepClone, isProbablySafeUrl, type Document, type NodeId } from "@/editor-core";

type UnsafeUrlKind = "image.src" | "image.linkTo" | "button.href";

type UnsafeUrl = {
  nodeId: NodeId;
  kind: UnsafeUrlKind;
  value: string;
};

function hasControlOrWhitespace(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
    if (input[i].trim() === "") return true;
  }
  return false;
}

function isSafeUrlForExport(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (hasControlOrWhitespace(trimmed)) return false;
  return isProbablySafeUrl(trimmed);
}

function listUnsafeUrls(doc: Document): UnsafeUrl[] {
  const unsafe: UnsafeUrl[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "image") {
      const src = (n.props as { src?: unknown }).src;
      const linkTo = (n.props as { linkTo?: unknown }).linkTo;

      if (typeof src === "string" && src.trim() && !isSafeUrlForExport(src)) {
        unsafe.push({ nodeId: n.id, kind: "image.src", value: src });
      }

      if (typeof linkTo === "string" && linkTo.trim() && !isSafeUrlForExport(linkTo)) {
        unsafe.push({ nodeId: n.id, kind: "image.linkTo", value: linkTo });
      }
    }

    if (n.type === "button") {
      const href = (n.props as { href?: unknown }).href;
      if (typeof href === "string" && href.trim() && !isSafeUrlForExport(href)) {
        unsafe.push({ nodeId: n.id, kind: "button.href", value: href });
      }
    }
  }

  unsafe.sort((a, b) => {
    if (a.nodeId !== b.nodeId) return a.nodeId.localeCompare(b.nodeId);
    return a.kind.localeCompare(b.kind);
  });

  return unsafe;
}

function formatWarnings(hiddenCount: number, unsafe: UnsafeUrl[]): string[] {
  const out: string[] = [];
  if (hiddenCount > 0) out.push(`${hiddenCount} hidden node(s) are excluded from HTML export.`);

  if (unsafe.length > 0) out.push(`Unsafe URLs are removed from HTML export (${unsafe.length}).`);

  if (unsafe.length > 0) {
    out.push(...unsafe.slice(0, 5).map((u) => `- ${u.kind} on ${u.nodeId}: ${u.value}`));
    if (unsafe.length > 5) out.push(`- ...and ${unsafe.length - 5} more`);
  }

  return out;
}

export function collectHtmlExportWarnings(doc: Document): string[] {
  const hiddenCount = Object.values(doc.nodes).filter((n) => Boolean(n.constraints?.hidden)).length;
  const unsafe = listUnsafeUrls(doc);
  return formatWarnings(hiddenCount, unsafe);
}

export function sanitizeDocumentForHtmlExport(doc: Document): { doc: Document; warnings: string[] } {
  const hiddenCount = Object.values(doc.nodes).filter((n) => Boolean(n.constraints?.hidden)).length;
  const unsafe = listUnsafeUrls(doc);
  const warnings = formatWarnings(hiddenCount, unsafe);

  if (unsafe.length === 0) {
    return { doc, warnings };
  }

  const next = deepClone(doc);

  for (const u of unsafe) {
    const node = next.nodes[u.nodeId];
    if (!node) continue;

    if (u.kind === "image.src" && node.type === "image") {
      (node.props as Record<string, unknown>).src = "";
      continue;
    }
    if (u.kind === "image.linkTo" && node.type === "image") {
      (node.props as Record<string, unknown>).linkTo = "";
      continue;
    }
    if (u.kind === "button.href" && node.type === "button") {
      (node.props as Record<string, unknown>).href = "";
      continue;
    }
  }

  return { doc: next, warnings };
}
