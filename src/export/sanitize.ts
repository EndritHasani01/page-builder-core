import { deepClone, isProbablySafeUrl, type Document, type NodeId } from "@/editor-core";
import { isSafeEmbedDomain, parseVideoUrl } from "@/editor-core/mediaUtils";

type UnsafeUrlKind = "image.src" | "image.linkTo" | "button.href" | "text.link" | "form.action" | "video.url" | "embed.url";

type UnsafeUrl = {
  nodeId: NodeId;
  kind: UnsafeUrlKind;
  value: string;
};

function listUnsafeUrls(doc: Document): UnsafeUrl[] {
  const unsafe: UnsafeUrl[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "image") {
      const src = (n.props as { src?: unknown }).src;
      const linkTo = (n.props as { linkTo?: unknown }).linkTo;

      if (typeof src === "string" && src.trim() && !isProbablySafeUrl(src)) {
        unsafe.push({ nodeId: n.id, kind: "image.src", value: src });
      }

      if (typeof linkTo === "string" && linkTo.trim() && !isProbablySafeUrl(linkTo)) {
        unsafe.push({ nodeId: n.id, kind: "image.linkTo", value: linkTo });
      }
    }

    if (n.type === "button") {
      const href = (n.props as { href?: unknown }).href;
      if (typeof href === "string" && href.trim() && !isProbablySafeUrl(href)) {
        unsafe.push({ nodeId: n.id, kind: "button.href", value: href });
      }
    }

    if (n.type === "form") {
      const action = (n.props as { action?: unknown }).action;
      if (typeof action === "string" && action.trim() && !isProbablySafeUrl(action)) {
        unsafe.push({ nodeId: n.id, kind: "form.action", value: action });
      }
    }

    if (n.type === "video") {
      const url = (n.props as { url?: unknown }).url;
      if (typeof url === "string" && url.trim() && (!isProbablySafeUrl(url) || !parseVideoUrl(url))) {
        unsafe.push({ nodeId: n.id, kind: "video.url", value: url });
      }
    }

    if (n.type === "embed") {
      const url = (n.props as { url?: unknown }).url;
      if (typeof url === "string" && url.trim() && !isSafeEmbedDomain(url)) {
        unsafe.push({ nodeId: n.id, kind: "embed.url", value: url });
      }
    }

    if (n.type === "text") {
      const content = (n.props as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const seg of content) {
          const segRecord = seg as Record<string, unknown>;
          const link = segRecord?.link as Record<string, unknown> | undefined;
          const href = link?.href as string | undefined;
          if (typeof href === "string" && href.trim() && !isProbablySafeUrl(href)) {
            unsafe.push({ nodeId: n.id, kind: "text.link", value: href });
            break; // one warning per node is enough
          }
        }
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
    if (u.kind === "form.action" && node.type === "form") {
      (node.props as Record<string, unknown>).action = "";
      continue;
    }
    if (u.kind === "video.url" && node.type === "video") {
      (node.props as Record<string, unknown>).url = "";
      continue;
    }
    if (u.kind === "embed.url" && node.type === "embed") {
      (node.props as Record<string, unknown>).url = "";
      continue;
    }
    if (u.kind === "text.link" && node.type === "text") {
      const content = (node.props as Record<string, unknown>).content as Array<Record<string, unknown>>;
      if (Array.isArray(content)) {
        (node.props as Record<string, unknown>).content = content.map((seg) => {
          const link = seg.link as Record<string, unknown> | undefined;
          const href = link?.href as string | undefined;
          if (typeof href === "string" && href.trim() && !isProbablySafeUrl(href)) {
            const { link: _removed, ...rest } = seg;
            void _removed;
            return rest;
          }
          return seg;
        });
      }
      continue;
    }
  }

  return { doc: next, warnings };
}
