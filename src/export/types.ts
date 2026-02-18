import type { Breakpoint, Document } from "@/editor-core";

export type HtmlExportMode = "full" | "snippet";

export type HtmlExportOptions = {
  breakpoint: Breakpoint;
  mode?: HtmlExportMode;
};

export type HtmlExportResult = {
  html: string;
  warnings: string[];
};

export type JsonExportResult = {
  json: string;
};

export type ExportJson = (doc: Document) => JsonExportResult;
export type ExportHtml = (doc: Document, opts: HtmlExportOptions) => Promise<HtmlExportResult>;

