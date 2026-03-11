import type { ReactNode } from "react";

import type { Breakpoint, Document } from "@/editor-core";
import { isProbablySafeUrl } from "@/editor-core/validationUtils";
import { RenderDocument, themeToCssVars } from "@/renderer";

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

type SanitizeSnippetResult = { sanitized: string; stripped: boolean };

function sanitizeHeadSnippet(raw: string): SanitizeSnippetResult {
  // Strip <script ...>...</script> blocks (including multi-line)
  let result = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  // Strip inline event handler attributes (on*)
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  const stripped = result !== raw;
  return { sanitized: result, stripped };
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

function buildThemeStyleBlock(doc: Document): string {
  const vars = themeToCssVars(doc.theme) as Record<string, string>;
  const declarations = Object.entries(vars)
    .map(([prop, value]) => {
      const safeValue = String(value);
      // Reject values that could break out of the style block
      if (safeValue.includes("</")) return "";
      return `${prop}:${safeValue}`;
    })
    .filter(Boolean)
    .join(";");
  return `<style>:root{${declarations}}</style>`;
}

function htmlShell(
  body: string,
  opts: {
    title: string;
    lang: string;
    themeStyle: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    favicon?: string;
    canonicalUrl?: string;
    headSnippet?: string;
  },
): string {
  const metaTags: string[] = [];

  if (opts.description) {
    metaTags.push(`<meta name="description" content="${escapeAttr(opts.description)}">`);
  }

  const ogTitleVal = opts.ogTitle || opts.title;
  metaTags.push(`<meta property="og:title" content="${escapeAttr(ogTitleVal)}">`);

  const ogDescVal = opts.ogDescription || opts.description;
  if (ogDescVal) {
    metaTags.push(`<meta property="og:description" content="${escapeAttr(ogDescVal)}">`);
  }

  if (opts.ogImage) {
    metaTags.push(`<meta property="og:image" content="${escapeAttr(opts.ogImage)}">`);
  }

  if (opts.favicon) {
    metaTags.push(`<link rel="icon" href="${escapeAttr(opts.favicon)}">`);
  }

  if (opts.canonicalUrl) {
    metaTags.push(`<link rel="canonical" href="${escapeAttr(opts.canonicalUrl)}">`);
  }

  return [
    "<!doctype html>",
    `<html lang="${escapeAttr(opts.lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(opts.title)}</title>`,
    ...metaTags,
    opts.themeStyle,
    opts.headSnippet ?? "",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ]
    .filter((line) => line !== "")
    .join("");
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

  const m = sanitized.doc.meta;
  const exportWarnings: string[] = [...sanitized.warnings];

  function safeMetaUrl(value: string | undefined, field: string): string | undefined {
    if (!value) return undefined;
    if (!isProbablySafeUrl(value)) {
      exportWarnings.push(`meta.${field} was stripped: unsafe URL "${value}".`);
      return undefined;
    }
    return value;
  }

  let sanitizedSnippet: string | undefined;
  if (m.headSnippet) {
    const { sanitized: clean, stripped } = sanitizeHeadSnippet(m.headSnippet);
    if (stripped) {
      exportWarnings.push("Custom head snippet had script tags or event handlers stripped for security.");
    }
    sanitizedSnippet = clean.trim() || undefined;
  }

  return {
    html: htmlShell(body, {
      title,
      lang,
      themeStyle: buildThemeStyleBlock(sanitized.doc),
      description: m.description,
      ogTitle: m.ogTitle,
      ogDescription: m.ogDescription,
      ogImage: safeMetaUrl(m.ogImage, "ogImage"),
      favicon: safeMetaUrl(m.favicon, "favicon"),
      canonicalUrl: safeMetaUrl(m.canonicalUrl, "canonicalUrl"),
      headSnippet: sanitizedSnippet,
    }),
    warnings: exportWarnings,
  };
}

