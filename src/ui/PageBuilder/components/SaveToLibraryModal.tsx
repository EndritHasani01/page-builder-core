import { useEffect, useRef, useState } from "react";

import { getExistingCategories } from "@/persistence/componentLibrary";

import styles from "./SaveToLibraryModal.module.css";

const DATALIST_ID = "pb-comp-lib-categories";

interface Props {
  defaultName: string;
  onClose: () => void;
  onConfirm: (name: string, category: string) => void;
}

export function SaveToLibraryModal({ defaultName, onClose, onConfirm }: Props) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState(() => {
    const existing = getExistingCategories();
    return existing[existing.length - 1] ?? "Uncategorized";
  });

  const categories = getExistingCategories();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.select();
  }, []);

  const canSave = name.trim().length > 0 && category.trim().length > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSave) {
      onConfirm(name.trim(), category.trim());
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="save-to-library-overlay">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Save to Library"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>Save to Library</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pb-comp-name">
              Name
            </label>
            <input
              ref={nameRef}
              id="pb-comp-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Component"
              data-testid="save-to-library-name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pb-comp-category">
              Category
            </label>
            <input
              id="pb-comp-category"
              className={styles.input}
              type="text"
              list={DATALIST_ID}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Uncategorized"
              data-testid="save-to-library-category"
            />
            {categories.length > 0 && (
              <datalist id={DATALIST_ID}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={!canSave}
            onClick={() => onConfirm(name.trim(), category.trim())}
            data-testid="save-to-library-confirm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
