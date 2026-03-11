import { useState } from "react";

import type { Document } from "@/editor-core";
import { isProbablySafeUrl } from "@/editor-core/validationUtils";
import type { EditorAction } from "@/store";

import styles from "./PageSettingsInspector.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageSettingsInspectorProps {
  doc: Document;
  disabled: boolean;
  dispatch: (action: EditorAction) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const LANGUAGE_OPTIONS = [
  { label: "English (en)", value: "en" },
  { label: "Spanish (es)", value: "es" },
  { label: "French (fr)", value: "fr" },
  { label: "German (de)", value: "de" },
  { label: "Italian (it)", value: "it" },
  { label: "Portuguese (pt)", value: "pt" },
  { label: "Dutch (nl)", value: "nl" },
  { label: "Japanese (ja)", value: "ja" },
  { label: "Chinese (zh)", value: "zh" },
  { label: "Korean (ko)", value: "ko" },
  { label: "Arabic (ar)", value: "ar" },
  { label: "Russian (ru)", value: "ru" },
  { label: "Hindi (hi)", value: "hi" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CollapsibleSection(props: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <div className={styles.section}>
      <button type="button" className={styles.sectionToggle} onClick={() => setOpen((v) => !v)}>
        {props.label}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▼</span>
      </button>
      {open && <div className={styles.sectionBody}>{props.children}</div>}
    </div>
  );
}

function FieldRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{props.label}</label>
      {props.children}
    </div>
  );
}

function UrlInput(props: {
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const unsafe = props.value.trim() !== "" && !isProbablySafeUrl(props.value.trim());
  return (
    <>
      <input
        type="text"
        className={`${styles.fieldInput}${unsafe ? ` ${styles.invalid}` : ""}`}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {unsafe && (
        <span className={styles.urlWarning}>
          URL must start with https://, http://, or / (relative path).
        </span>
      )}
    </>
  );
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function SeoPreviewCard(props: {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  slug: string;
}) {
  const displayTitle = props.ogTitle || props.title || "Untitled Page";
  const displayDesc = props.ogDescription || props.description || "";
  const displayUrl = props.slug ? `example.com/${props.slug}` : "example.com/page";
  const displaySearchTitle = props.title || "Untitled Page";
  const displaySearchDesc = props.description || "";

  return (
    <div className={styles.previewCard}>
      <span className={styles.previewLabel}>Google preview</span>
      <div className={styles.googlePreview}>
        <div className={styles.googleTitle}>{displaySearchTitle}</div>
        <div className={styles.googleUrl}>{displayUrl}</div>
        <div className={styles.googleDesc}>{displaySearchDesc || "No description set."}</div>
      </div>

      <span className={styles.previewLabel}>Social share preview</span>
      <div className={styles.socialCard}>
        {props.ogImage ? (
          <img className={styles.socialCardImage} src={props.ogImage} alt="" />
        ) : (
          <div className={styles.socialCardImage}>No OG image</div>
        )}
        <div className={styles.socialCardBody}>
          <div className={styles.socialCardTitle}>{displayTitle}</div>
          <div className={styles.socialCardDesc}>{displayDesc || "No description set."}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PageSettingsInspector({ doc, disabled, dispatch }: PageSettingsInspectorProps) {
  const meta = doc.meta;
  const rootNode = doc.nodes[doc.rootId];
  const lang = rootNode?.type === "page" ? (rootNode.props.lang ?? "en") : "en";

  function patchMeta(patch: Partial<typeof meta>) {
    dispatch({ type: "UPDATE_META", patch } as EditorAction);
  }

  function patchLang(value: string) {
    dispatch({ type: "UPDATE_PROPS", nodeId: doc.rootId, patch: { lang: value } } as EditorAction);
  }

  const descLen = (meta.description ?? "").length;
  const descCountClass =
    descLen > 300
      ? styles.charCountOver
      : descLen > 160
        ? styles.charCountWarn
        : styles.charCountGood;

  return (
    <div className={styles.root}>
      <p className={styles.heading}>Page Settings</p>

      <CollapsibleSection label="General" defaultOpen>
        <FieldRow label="Title">
          <input
            type="text"
            className={styles.fieldInput}
            value={meta.title}
            disabled={disabled}
            onChange={(e) => patchMeta({ title: e.target.value })}
          />
        </FieldRow>

        <FieldRow label="Slug">
          <div className={styles.slugRow}>
            <input
              type="text"
              className={styles.slugInput}
              value={meta.slug ?? ""}
              placeholder={toSlug(meta.title)}
              disabled={disabled}
              onChange={(e) => patchMeta({ slug: e.target.value })}
            />
            <button
              type="button"
              className={styles.autoSlugBtn}
              disabled={disabled}
              onClick={() => patchMeta({ slug: toSlug(meta.title) })}
              title="Auto-generate from title"
            >
              Auto
            </button>
          </div>
        </FieldRow>

        <FieldRow label="Language">
          <select
            className={styles.fieldSelect}
            value={lang}
            disabled={disabled}
            onChange={(e) => patchLang(e.target.value)}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {!LANGUAGE_OPTIONS.some((o) => o.value === lang) && (
              <option value={lang}>{lang}</option>
            )}
          </select>
        </FieldRow>

        <FieldRow label="Favicon URL">
          <UrlInput
            value={meta.favicon ?? ""}
            placeholder="https://example.com/favicon.ico"
            disabled={disabled}
            onChange={(v) => patchMeta({ favicon: v })}
          />
        </FieldRow>
      </CollapsibleSection>

      <CollapsibleSection label="SEO & Social" defaultOpen>
        <FieldRow label="Meta description">
          <textarea
            className={styles.fieldTextarea}
            rows={3}
            value={meta.description ?? ""}
            disabled={disabled}
            onChange={(e) => patchMeta({ description: e.target.value })}
          />
          <span className={`${styles.charCount} ${descCountClass}`}>{descLen} / 160</span>
        </FieldRow>

        <FieldRow label="OG Title">
          <input
            type="text"
            className={styles.fieldInput}
            value={meta.ogTitle ?? ""}
            placeholder={meta.title || "Page title"}
            disabled={disabled}
            onChange={(e) => patchMeta({ ogTitle: e.target.value })}
          />
        </FieldRow>

        <FieldRow label="OG Description">
          <input
            type="text"
            className={styles.fieldInput}
            value={meta.ogDescription ?? ""}
            placeholder={meta.description || "Page description"}
            disabled={disabled}
            onChange={(e) => patchMeta({ ogDescription: e.target.value })}
          />
        </FieldRow>

        <FieldRow label="OG Image URL">
          <UrlInput
            value={meta.ogImage ?? ""}
            placeholder="https://example.com/og-image.png"
            disabled={disabled}
            onChange={(v) => patchMeta({ ogImage: v })}
          />
        </FieldRow>

        <SeoPreviewCard
          title={meta.title}
          description={meta.description ?? ""}
          ogTitle={meta.ogTitle ?? ""}
          ogDescription={meta.ogDescription ?? ""}
          ogImage={meta.ogImage ?? ""}
          slug={meta.slug ?? ""}
        />
      </CollapsibleSection>

      <CollapsibleSection label="Advanced" defaultOpen={false}>
        <FieldRow label="Canonical URL">
          <UrlInput
            value={meta.canonicalUrl ?? ""}
            placeholder="https://example.com/page"
            disabled={disabled}
            onChange={(v) => patchMeta({ canonicalUrl: v })}
          />
        </FieldRow>

        <FieldRow label="Custom head snippet">
          <div className={styles.snippetWarning}>
            This content will be included as-is in the HTML export. Use with caution.
            Script tags and event handlers will be stripped on export.
          </div>
          <textarea
            className={styles.fieldTextarea}
            rows={5}
            value={meta.headSnippet ?? ""}
            disabled={disabled}
            onChange={(e) => patchMeta({ headSnippet: e.target.value })}
          />
        </FieldRow>
      </CollapsibleSection>
    </div>
  );
}
