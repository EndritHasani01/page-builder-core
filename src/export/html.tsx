import type { ReactNode } from "react";

import type { Breakpoint, Document } from "@/editor-core";
import { RenderDocument } from "@/renderer";

import { sanitizeDocumentForHtmlExport } from "./sanitize";
import type { HtmlExportMode, HtmlExportOptions, HtmlExportResult } from "./types";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

function isProbablyValidLang(input: string): boolean {
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(input.trim());
}

async function getRenderToStaticMarkup(): Promise<(node: ReactNode) => string> {
  try {
    const mod = (await import("react-dom/server.browser")) as unknown as {
      renderToStaticMarkup?: (node: ReactNode) => string;
    };
    if (typeof mod.renderToStaticMarkup === "function") return mod.renderToStaticMarkup;
  } catch {
    // ignore and fall back
  }

  const mod = (await import("react-dom/server")) as unknown as {
    renderToStaticMarkup: (node: ReactNode) => string;
  };
  return mod.renderToStaticMarkup;
}

function htmlShell(body: string, opts: { title: string; lang: string }): string {
  return [
    "<!doctype html>",
    `<html lang="${escapeAttr(opts.lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(opts.title)}</title>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].join("");
}

export async function exportDocumentToHtml(doc: Document, opts: HtmlExportOptions): Promise<HtmlExportResult> {
  const breakpoint: Breakpoint = opts.breakpoint;
  const mode: HtmlExportMode = opts.mode ?? "full";

  const sanitized = sanitizeDocumentForHtmlExport(doc);
  const renderToStaticMarkup = await getRenderToStaticMarkup();

  const body = renderToStaticMarkup(<RenderDocument doc={sanitized.doc} mode="export" breakpoint={breakpoint} />);

  if (mode === "snippet") return { html: body, warnings: sanitized.warnings };

  const root = sanitized.doc.nodes[sanitized.doc.rootId];
  const rawLang = root && root.type === "page" ? ((root.props as { lang?: unknown }).lang ?? "en") : "en";
  const lang = typeof rawLang === "string" && isProbablyValidLang(rawLang) ? rawLang : "en";
  const title =
    typeof sanitized.doc.meta.title === "string" && sanitized.doc.meta.title.trim()
      ? sanitized.doc.meta.title
      : "Page";

  return { html: htmlShell(body, { title, lang }), warnings: sanitized.warnings };
}

