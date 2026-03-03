import { useState } from "react";
import type { TemplateDefinition } from "@/templates";
import styles from "./TemplateGallery.module.css";
import pbStyles from "../PageBuilder.module.css";

// Simple SVG layout thumbnails for each template type
const THUMBNAIL_SVGS: Record<string, string> = {
  blank: `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#f9fafb"/>
    <rect x="12" y="12" width="256" height="156" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
    <rect x="24" y="24" width="112" height="8" rx="3" fill="#e5e7eb"/>
    <rect x="144" y="24" width="112" height="8" rx="3" fill="#e5e7eb"/>
    <rect x="24" y="44" width="112" height="6" rx="3" fill="#f3f4f6"/>
    <rect x="144" y="44" width="112" height="6" rx="3" fill="#f3f4f6"/>
  </svg>`,
  "landing-page": `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#f9fafb"/>
    <rect x="0" y="0" width="280" height="60" fill="#2563eb" opacity="0.12"/>
    <rect x="12" y="10" width="100" height="10" rx="3" fill="#2563eb"/>
    <rect x="12" y="26" width="70" height="6" rx="3" fill="#6b7280"/>
    <rect x="12" y="38" width="50" height="12" rx="4" fill="#2563eb"/>
    <rect x="160" y="8" width="108" height="44" rx="4" fill="#2563eb" opacity="0.3"/>
    <rect x="12" y="74" width="80" height="7" rx="3" fill="#374151"/>
    <rect x="100" y="74" width="80" height="7" rx="3" fill="#374151"/>
    <rect x="188" y="74" width="80" height="7" rx="3" fill="#374151"/>
    <rect x="12" y="86" width="80" height="20" rx="3" fill="#f3f4f6"/>
    <rect x="100" y="86" width="80" height="20" rx="3" fill="#f3f4f6"/>
    <rect x="188" y="86" width="80" height="20" rx="3" fill="#f3f4f6"/>
    <rect x="0" y="118" width="280" height="62" fill="#2563eb" opacity="0.08"/>
    <rect x="12" y="130" width="100" height="9" rx="3" fill="#374151"/>
    <rect x="12" y="146" width="56" height="12" rx="4" fill="#2563eb"/>
  </svg>`,
  portfolio: `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#f9fafb"/>
    <rect x="0" y="0" width="280" height="56" fill="#111827" opacity="0.08"/>
    <rect x="12" y="10" width="90" height="10" rx="3" fill="#111827"/>
    <rect x="12" y="26" width="110" height="5" rx="3" fill="#6b7280"/>
    <rect x="12" y="36" width="50" height="10" rx="4" fill="#2563eb"/>
    <rect x="176" y="6" width="92" height="44" rx="50" fill="#d1d5db"/>
    <rect x="12" y="66" width="120" height="50" rx="4" fill="#d1d5db"/>
    <rect x="144" y="66" width="6" height="50" fill="transparent"/>
    <rect x="148" y="70" width="80" height="7" rx="3" fill="#2563eb"/>
    <rect x="148" y="82" width="120" height="5" rx="3" fill="#e5e7eb"/>
    <rect x="148" y="92" width="120" height="5" rx="3" fill="#e5e7eb"/>
    <rect x="148" y="102" width="60" height="5" rx="3" fill="#e5e7eb"/>
    <rect x="12" y="128" width="80" height="8" rx="3" fill="#374151"/>
    <rect x="12" y="140" width="120" height="5" rx="3" fill="#e5e7eb"/>
    <rect x="12" y="150" width="100" height="5" rx="3" fill="#e5e7eb"/>
  </svg>`,
  "blog-post": `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#f9fafb"/>
    <rect x="12" y="14" width="160" height="12" rx="3" fill="#111827"/>
    <rect x="12" y="30" width="130" height="7" rx="3" fill="#6b7280"/>
    <rect x="12" y="44" width="256" height="1" fill="#e5e7eb"/>
    <rect x="12" y="52" width="256" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="62" width="256" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="72" width="200" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="86" width="100" height="7" rx="3" fill="#374151"/>
    <rect x="12" y="98" width="256" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="108" width="256" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="118" width="180" height="5" rx="2" fill="#d1d5db"/>
    <rect x="12" y="136" width="36" height="36" rx="18" fill="#d1d5db"/>
    <rect x="56" y="140" width="80" height="7" rx="3" fill="#374151"/>
    <rect x="56" y="152" width="120" height="5" rx="2" fill="#d1d5db"/>
  </svg>`,
  pricing: `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#f9fafb"/>
    <rect x="60" y="10" width="160" height="10" rx="3" fill="#111827"/>
    <rect x="80" y="26" width="120" height="5" rx="3" fill="#6b7280"/>
    <rect x="12" y="42" width="80" height="124" rx="6" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
    <rect x="100" y="42" width="80" height="124" rx="6" fill="#2563eb" opacity="0.12" stroke="#2563eb" stroke-width="1.5"/>
    <rect x="188" y="42" width="80" height="124" rx="6" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
    <rect x="20" y="52" width="64" height="6" rx="3" fill="#374151"/>
    <rect x="108" y="52" width="64" height="6" rx="3" fill="#2563eb"/>
    <rect x="196" y="52" width="64" height="6" rx="3" fill="#374151"/>
    <rect x="20" y="64" width="50" height="8" rx="3" fill="#111827"/>
    <rect x="108" y="64" width="50" height="8" rx="3" fill="#2563eb"/>
    <rect x="196" y="64" width="50" height="8" rx="3" fill="#111827"/>
    <rect x="20" y="80" width="64" height="4" rx="2" fill="#d1d5db"/>
    <rect x="20" y="88" width="55" height="4" rx="2" fill="#d1d5db"/>
    <rect x="20" y="96" width="60" height="4" rx="2" fill="#d1d5db"/>
    <rect x="108" y="80" width="64" height="4" rx="2" fill="#93c5fd"/>
    <rect x="108" y="88" width="55" height="4" rx="2" fill="#93c5fd"/>
    <rect x="108" y="96" width="60" height="4" rx="2" fill="#93c5fd"/>
    <rect x="196" y="80" width="64" height="4" rx="2" fill="#d1d5db"/>
    <rect x="196" y="88" width="55" height="4" rx="2" fill="#d1d5db"/>
    <rect x="196" y="96" width="60" height="4" rx="2" fill="#d1d5db"/>
    <rect x="20" y="148" width="64" height="12" rx="4" fill="#e5e7eb"/>
    <rect x="108" y="148" width="64" height="12" rx="4" fill="#2563eb"/>
    <rect x="196" y="148" width="64" height="12" rx="4" fill="#e5e7eb"/>
  </svg>`,
  "coming-soon": `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg">
    <rect width="280" height="180" fill="#2563eb" opacity="0.08"/>
    <rect x="30" y="60" width="220" height="18" rx="5" fill="#2563eb"/>
    <rect x="70" y="88" width="140" height="6" rx="3" fill="#6b7280"/>
    <rect x="70" y="100" width="140" height="6" rx="3" fill="#6b7280"/>
    <rect x="100" y="118" width="80" height="14" rx="5" fill="#2563eb"/>
  </svg>`,
};

function TemplateThumbnail({ templateId }: { templateId: string }) {
  const svg = THUMBNAIL_SVGS[templateId];
  if (!svg) {
    return (
      <div className={styles.thumbnailFallback}>
        <span>{templateId}</span>
      </div>
    );
  }
  return (
    <div
      className={styles.thumbnail}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden="true"
    />
  );
}

type TemplateGalleryProps = {
  templates: TemplateDefinition[];
  onClose: () => void;
  onConfirm: (templateId: string, title: string) => void;
};

export function TemplateGallery({ templates, onClose, onConfirm }: TemplateGalleryProps) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? "blank");
  const [title, setTitle] = useState<string>(() => templates.find(t => t.id === (templates[0]?.id ?? "blank"))?.name ?? "");

  function handleSelectTemplate(id: string) {
    setSelectedId(id);
    const tmpl = templates.find(t => t.id === id);
    if (tmpl) setTitle(tmpl.name);
  }

  function handleConfirm() {
    const trimmed = title.trim();
    onConfirm(selectedId, trimmed || (templates.find(t => t.id === selectedId)?.name ?? "Untitled"));
  }

  const selectedTemplate = templates.find(t => t.id === selectedId);

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a template"
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>Choose a Template</div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid} role="listbox" aria-label="Templates">
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                role="option"
                aria-selected={tmpl.id === selectedId}
                className={tmpl.id === selectedId ? styles.cardSelected : styles.card}
                onClick={() => handleSelectTemplate(tmpl.id)}
              >
                <TemplateThumbnail templateId={tmpl.id} />
                <div className={styles.cardInfo}>
                  <div className={styles.cardName}>{tmpl.name}</div>
                  <div className={styles.cardDesc}>{tmpl.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          {selectedTemplate ? (
            <div className={styles.footerLeft}>
              <label className={styles.titleLabel} htmlFor="gallery-title">Document title</label>
              <input
                id="gallery-title"
                type="text"
                className={styles.titleInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                placeholder={selectedTemplate.name}
                autoFocus
              />
            </div>
          ) : null}
          <div className={styles.footerActions}>
            <button type="button" className={pbStyles.button} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`${pbStyles.button} ${styles.createBtn}`}
              onClick={handleConfirm}
              disabled={!selectedId}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
